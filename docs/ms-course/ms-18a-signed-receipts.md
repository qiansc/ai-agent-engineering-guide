# 给 Agent 动作签收据：离线验证工具调用有没有被改写

一次旅行 Agent 预订争议发生后，日志显示它查了航班、申请了座位、调用了预订接口。审计者接下来会问：这些记录是不是后来被人改过？带数字签名的收据能回答“某个受信任密钥签过哪些内容、签后有没有变化”；把收据按哈希串起来，还能检查一段已知链的顺序。这项能力让审计记录更可验证，但不会自动证明 Agent 做了正确决定。

## 收据里放什么

一张工具调用收据可以记录类型 `agent.tool_call.v1`、Agent ID、工具名、工具参数摘要、结果摘要、策略版本、时间戳、序号和上一张收据哈希。参数与结果往往含个人资料或商业数据，因此收据通常存 SHA-256 摘要，原内容另存于权限受控的位置。日后若需要核对，审计者拿到获授权的原内容，重新计算摘要与收据比对。

```json
{
  "type": "agent.tool_call.v1",
  "agent_id": "travel-agent",
  "tool_name": "lookup_flights",
  "tool_args_hash": "sha256:...",
  "result_hash": "sha256:...",
  "policy_id": "travel-policy-v3",
  "timestamp": "2026-04-25T14:30:00Z",
  "sequence": 47,
  "previous_receipt_hash": "sha256:...",
  "signature": {
    "alg": "EdDSA",
    "sig": "...",
    "public_key": "..."
  }
}
```

示例值只是说明字段，省略号不是有效摘要或签名。`policy_id` 记录宣称使用的策略版本；如果执行器没有真正运行该策略，签名会忠实封存这个错误声明，并不会神奇地补上授权。

## 为什么先规范化，再哈希和签名

JSON 对象可以有不同的空格、字段顺序和数字格式。直接给任意文本签名，另一语言的验证器可能把同一对象序列化成不同字节。RFC 8785 的 JCS 定义规范 JSON 字节；双方对同一个收据负载使用相同规范化规则，才能得到相同字节。工具参数和结果各自先用 SHA-256 生成摘要，填入收据负载；签收据时先去掉 `signature` 字段，再对剩余负载做 JCS 规范化，直接用 Ed25519 私钥签规范字节。验证者拿签名、公钥和收据做相同计算，判断是否匹配。

```python
import base64
import hashlib
from nacl import signing
from jcs import canonicalize

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")

def digest_json(value) -> str:
    return "sha256:" + hashlib.sha256(canonicalize(value)).hexdigest()

def sign_payload(payload: dict, key: signing.SigningKey) -> dict:
    canonical = canonicalize(payload)
    signed = key.sign(canonical).signature
    return {
        **payload,
        "signature": {
            "alg": "EdDSA",
            "sig": b64url(signed),
            "public_key": b64url(bytes(key.verify_key)),
        },
    }
```

要自己完成“篡改后验证失败”的练习，还需要验证端，而不只是签名端。下面的函数故意把**可信公钥作为独立参数**传入；不能从待验证收据里读出任意公钥，就宣称签名者已获授权。示例假定调用方已经从可信配置中取得对应 Agent 的公钥，且用的是上面“直接签 JCS 字节”的格式：

```python
from nacl.exceptions import BadSignatureError

def decode_b64url(value: str) -> bytes:
    if not isinstance(value, str):
        raise ValueError("Signature must be text")
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))

def verify_payload(receipt: dict, trusted_public_key: bytes) -> bool:
    try:
        signature = receipt["signature"]
        if signature["alg"] != "EdDSA":
            return False
        payload = {k: v for k, v in receipt.items() if k != "signature"}
        canonical = canonicalize(payload)
        signing.VerifyKey(trusted_public_key).verify(
            canonical, decode_b64url(signature["sig"])
        )
        return True
    except (KeyError, TypeError, ValueError, BadSignatureError):
        return False

key = signing.SigningKey.generate()  # 只用于本地练习
payload = {
    "type": "agent.tool_call.v1",
    "agent_id": "travel-agent",
    "tool_name": "lookup_flights",
    "tool_args_hash": digest_json({"origin": "SYD", "destination": "LAX"}),
    "result_hash": digest_json([{"flight": "QF11", "price": 1850}]),
    "policy_id": "travel-policy-v3",
    "timestamp": "2026-04-25T14:30:00Z",
    "sequence": 0,
    "previous_receipt_hash": None,
}
receipt = sign_payload(payload, key)
trusted_public_key = bytes(key.verify_key)
assert verify_payload(receipt, trusted_public_key)
tampered = {**receipt, "policy_id": "travel-policy-v2"}
assert not verify_payload(tampered, trusted_public_key)
```

这个片段能在安装 `PyNaCl` 和 `jcs` 的本地环境演示签名、验证与字段篡改；尚未验证你自己的密钥注册表、时间戳、链或业务结果。课程归档的 Notebook 采用“先对 JCS 字节求 SHA-256，再让 Ed25519 签这个摘要”的另一种约定；它和上面的“Ed25519 直接签 JCS 字节”**不能互相验签**。两者都必须把签名字节规则写入版本化协议，签署与验证两端严格一致，不要拿一种实现签名、另一种实现验证。

生产中私钥应从受控密钥服务加载，不应每次任务临时生成，也不能写在 Notebook 或源码里。这里签的是 JCS 规范字节，而不是收据的任意 JSON 文本，也不是先给完整收据做 SHA-256 再签摘要；验证端必须遵守同一字节规则。Ed25519 的内部哈希不等于额外使用 Ed25519ph。密钥 ID、算法与收据格式都要版本化，便于以后轮换。

## 验证与篡改实验

验证时把 `signature` 拿开，对剩余字段做 JCS，使用可信的公钥验证规范字节上的签名。为教学可以从收据读取公钥，但仅这样只能证明“持有对应私钥的人签了它”，不能证明该密钥属于旅行公司或获准代表某 Agent。实际审计还要从独立可信的公钥注册表取得预期密钥，并检查当时有效期与撤销状态。

实验可以先签一张 `lookup_flights` 收据并验证，再把 `tool_args_hash` 的一个字符换掉：摘要不同，签名应失败。把 `policy_id` 从 v3 改成更宽松的 v2，也同样失败。若攻击者得到私钥，则可以给假收据重新签名，所以密钥保护与轮换和签名算法同样重要。验证器还要对缺字段、坏 base64、错误公钥长度和不支持的 `alg` 安全失败，不能在异常后把收据当作有效。

## 多步任务用哈希链连起来

工具调用 0 的 `previous_receipt_hash` 为空；调用 1 写入调用 0 的完整收据哈希；调用 2 写入调用 1 的哈希。验证者按序检查每张签名和前驱哈希。若有人从**已有的三张链**里删掉中间一张，后一张指向的前驱与展示出的前一张不符，链检查就会失败；重排同理。

哈希链有一个常被忽略的边界：如果攻击者把链**尾部全部删掉**，剩下的短链内部仍可能自洽。定期把链头或收据数量提交到外部可信时间戳、透明日志或独立系统，才能让未来审计者发现“原来还有后续收据”。若攻击者能控制签名私钥和全部存储，单纯在自己数据库里放链也不足以证明没有重写历史。链的意义取决于可信密钥与外部锚点。

## 它能证明与不能证明的事

有效签名证明指定密钥签过指定负载，签名后字段未变；若链的起点、终点和前驱都已可信固定，可以核对给定区间的顺序。它**不能**证明航班真实存在、工具结果准确、策略确实运行、用户真的批准、时间戳由可信时间源给出，或调用没有违反法律。输入本身被网页提示注入污染时，收据也只会忠实记录污染后的动作。

收据因此应与输入验证、权限决策、审批记录、工具执行状态和真实业务回执一起使用。一次付款的“模型提出调用”与“支付服务确认入账”应有不同事件，不可由一张模型签名收据冒充全部过程。

## 动手练习

在 `18-signed-receipts.ipynb` 所示流程里完成四件事：签一张工具收据、改一个字段看验证失败、构造三张哈希链并尝试删除中间项、把签名放进工具调用中间件。再加一个 `request_id` 字段，确保签名前后都参与规范化；最后模拟删除链尾，体会为什么要外部锚定。可以把两份收据的规范字节摘要按确定顺序组合进第三份收据，作为最小的包含证明练习；真正选择性披露需要更完整的 Merkle 承诺和验证协议。

## 面试会怎么问

Raytheon Agentic AI 系统面试复盘涉及安全治理和轨迹评测。若面试官问“如何证明 Agent 没改日志”，先区分普通日志、签名收据和外部锚定链；解释 JCS、SHA-256、Ed25519 负责哪一段，再指出可信公钥、私钥保护、尾部截断与业务正确性仍需要额外机制。能讲清这些边界，比笼统说“上链即可防篡改”可靠。

## 来源与延伸阅读

- [Microsoft AI Agents for Beginners · Securing AI Agents with Cryptographic Receipts](https://github.com/microsoft/ai-agents-for-beginners/tree/main/18-securing-ai-agents)（本文承接收据结构、签名、验证、链与四段练习）
- [RFC 8785 · JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785)、[RFC 8032 · EdDSA](https://www.rfc-editor.org/rfc/rfc8032)、[Signed Decision Receipts Internet-Draft](https://datatracker.ietf.org/doc/draft-farley-acta-signed-receipts/)（截至 2026-09 为 -03 个人草案，尚非正式 IETF 标准）
- [Raytheon 面试复盘](https://pocketfullofdhruv.wordpress.com/2026/08/18/agentic-ai-product-systems-eng-interview-experience-raytheon-tuscon-az-2026/)
