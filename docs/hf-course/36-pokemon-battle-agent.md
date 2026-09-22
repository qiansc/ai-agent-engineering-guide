# 造一个回合制对战 Agent：状态、工具调用与合法动作

这次练习把 LLM 接到 Pokémon Showdown 的回合制对战。它不需要生成游戏画面，而是每回合在合法招式和可切换宝可梦之间做一个选择。最重要的工程原则是：模型负责提出决策，游戏环境负责执行与校验。

## 四个部件各管什么

`poke-env` 提供 Python 的 `Player` 接口和 `Battle` 状态；Pokémon Showdown 提供对战模拟；`LLMAgentBase` 把战斗状态转成模型可读文本，再把函数调用转成游戏命令；`TemplateAgent` 是你填入模型客户端、提示词和响应解析的地方。不要让模板直接改 `Battle` 对象，也不要跳过基类里的合法性检查。

每回合核心调用是 `choose_move(battle)`。先格式化状态：我方和对方当前宝可梦、属性、剩余 HP、异常状态、能力变化，可用招式的威力/命中率/PP，可切换队员，以及天气、场地和双方场地效果。模型看不到你没传给它的信息；若需要估计对方隐藏招式，也只能作为推断，不可写成已知事实。

可以把格式化逻辑写在基类，确保每个模型实现拿到同样的状态：

```python
def _format_battle_state(self, battle):
    active = battle.active_pokemon
    opponent = battle.opponent_active_pokemon

    def describe_pokemon(pokemon):
        if pokemon is None:
            return "Unknown"
        types = "/".join(str(t) for t in pokemon.types)
        status = pokemon.status.name if pokemon.status else "None"
        hp = pokemon.current_hp_fraction * 100
        return (
            f"{pokemon.species} (Type: {types}; HP: {hp:.1f}%; "
            f"Status: {status}; Boosts: {pokemon.boosts})"
        )

    moves = [
        f"- {m.id} (Type: {m.type}; BP: {m.base_power}; "
        f"Acc: {m.accuracy}; PP: {m.current_pp}/{m.max_pp}; "
        f"Category: {m.category.name})"
        for m in battle.available_moves
    ]
    switches = [
        f"- {p.species} (HP: {p.current_hp_fraction * 100:.1f}%; "
        f"Status: {p.status.name if p.status else 'None'})"
        for p in battle.available_switches
    ]

    return "\n".join([
        f"Your active Pokemon: {describe_pokemon(active)}",
        f"Opponent's active Pokemon: {describe_pokemon(opponent)}",
        "Available moves:", *(moves or ["- None"]),
        "Available switches:", *(switches or ["- None"]),
        f"Weather: {battle.weather}",
        f"Terrains: {battle.fields}",
        f"Your side conditions: {battle.side_conditions}",
        f"Opponent side conditions: {battle.opponent_side_conditions}",
    ])
```

字段越多，越要留意空值和版本差异。例如 `battle.opponent_active_pokemon` 可能尚不可见；不能直接访问其属性。招式和切换列表为空时，也要告诉模型当前没有该类动作。

一个适合模型输入的简化状态如下：

```text
Your active Pokemon: Pikachu (Type: ELECTRIC), HP: 64%, Status: None
Opponent's active Pokemon: Gyarados (Type: WATER/FLYING), HP: 81%
Available moves:
- thunderbolt (Type: ELECTRIC, BP: 90, Acc: 1.0, PP: 12/15)
- quickattack (Type: NORMAL, BP: 40, Acc: 1.0, PP: 26/30)
Available switches:
- Venusaur (HP: 100%, Status: None)
Weather: None
```

这些数值只是示意；真实输入应从当前 `Battle` 对象生成。状态格式要稳定且尽量简洁，否则每回合重复传大量无关字段，会提高延迟和成本。

## 用两个动作工具限制输出

只允许 `choose_move(move_name)` 和 `choose_switch(pokemon_name)` 两种动作。模型返回函数名与参数；程序先按规范化 ID 查 `battle.available_moves`，必要时才尝试显示名称；切换也只能查 `battle.available_switches`。即使模型填了一个真实存在的招式，只要这一回合不可用，就不能执行。

名字解析可以这样写；`normalize_name` 应与所用 poke-env/Showdown 版本的 ID 规范一致，并对空字符串安全处理：

```python
def _find_move_by_name(self, battle, move_name):
    wanted = normalize_name(move_name)
    for move in battle.available_moves:
        if move.id == wanted:
            return move
    for move in battle.available_moves:
        if move.name.lower() == move_name.lower():
            return move
    return None

def _find_pokemon_by_name(self, battle, pokemon_name):
    wanted = normalize_name(pokemon_name)
    for pokemon in battle.available_switches:
        if normalize_name(pokemon.species) == wanted:
            return pokemon
    return None
```

精确 ID 优先，因为显示名称可能有空格、标点或地区形态；回退到显示名时最好记一条日志，便于发现提示词和解析器不一致。

```python
async def choose_move(self, battle):
    state = self._format_battle_state(battle)
    result = await self._get_llm_decision(state)
    decision = result.get("decision") or {}
    name = decision.get("name")
    args = decision.get("arguments") or {}

    if name == "choose_move":
        move = self._find_move_by_name(battle, args.get("move_name", ""))
        if move in battle.available_moves:
            return self.create_order(move)

    if name == "choose_switch":
        pokemon = self._find_pokemon_by_name(battle, args.get("pokemon_name", ""))
        if pokemon in battle.available_switches:
            return self.create_order(pokemon)

    if battle.available_moves or battle.available_switches:
        return self.choose_random_move(battle)
    return self.choose_default_move(battle)
```

这段只展示决策骨架；完整基类还要处理模型 API 异常、函数名未知、参数缺失、名字归一化和日志。回退动作不应静默发生，要记录原因和发生频率。随机回退可以让比赛继续，却会掩盖模型格式错误；评测时必须把回退率单独统计。

## 填好 TemplateAgent 的空白

`_get_llm_decision(battle_state)` 需要调用你选择的模型 API，并把提供方的响应解析为统一格式：

```python
{
    "decision": {
        "name": "choose_move",
        "arguments": {"move_name": "thunderbolt"},
    }
}
```

模板中 `TemplateModelProvider`、`model-name` 和提示词省略号都是占位符，不能直接运行。实现时向模型提供工具 schema、当前状态和明确目标（在规则内选择一步；若信息不足，仍从合法动作中选）。若响应没有函数调用、JSON 解析失败或超时，返回结构化 `error` 给基类，而不是把异常吞掉或伪造一个动作。模型 API 的异步调用要与 `async def` 配合。

提示词可以把目标与硬约束分开：目标是赢得对战；硬约束是只能从当前 `Available moves` / `Available switches` 中选择、只返回一个结构化调用、不能假定看不到的对手信息。工具 schema 应限定函数名和必填参数，而非让模型自由生成游戏命令。若模型服务支持强制工具选择，可考虑启用；仍要在执行端再次验证。`_get_llm_decision` 返回错误时，基类走可观测的回退路径，不应让 API 异常结束整个对战。

战斗策略可以从一个朴素基线起步：优先合法且有较高有效伤害的招式；在属性不利、血量低时考虑切换。然后再让模型处理复杂局面。没有规则基线，就很难判断 LLM 是否真的提高了胜率，还是只增加了成本和延迟。

## 测试不应只看一场胜负

至少测试：普通招式回合、只能切换的回合、无可用招式的回合、模型给非法招式、模型给未知函数、API 超时、名字大小写/显示名称差异。记录胜率，也记录每回合决策延迟、token、非法动作率和回退率。对相同对手跑多场，避免把随机对战结果当成策略改进。

## 面试会怎么问

**问：为什么不直接执行 LLM 返回的招式名？** 答：模型输出可能拼错、选到当前回合不可用招式或调用未知动作。必须与 `Battle` 的合法动作集合匹配，失败时有可观测的回退机制。

**问：如何评价对战 Agent？** 答：除多场胜率外，还看非法动作率、回退率、每步延迟、调用成本和对不同局面的稳定性，并与规则基线比较。

## 来源与延伸阅读

- [Hugging Face Agents Course：Build Your Pokémon Agent](https://huggingface.co/learn/agents-course/bonus-unit3/building_your_pokemon_agent)
- [完整基础类与示例实现](https://huggingface.co/spaces/Jofthomas/twitch_streaming/blob/main/agents.py)；[poke-env 文档](https://poke-env.readthedocs.io/en/stable/)
