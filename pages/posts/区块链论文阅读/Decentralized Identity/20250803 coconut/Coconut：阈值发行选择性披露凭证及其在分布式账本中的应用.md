---
title: Coconut：具有分布式账本应用的门限签发选择性披露凭证
date: 2025-08-08
categories: 
  - 论文阅读
---

## 作者

<p style="text-align:center">Alberto Sonnino\*†, Mustafa Al-Bassam\*†, Shehar Bano\*†, Sarah Meiklejohn\* 和 George Danezis\*†</p>
<p style="text-align:center">\* 英国伦敦大学学院</p>
<p style="text-align:center">† chainspace.io</p>

## 摘要

Coconut 是一种新型的选择性披露凭证方案，支持分布式门限签发、公共与私有属性、重新随机化，以及多种不可链接的选择性属性披露。Coconut 与区块链集成，以确保即使在部分凭证签发机构存在恶意或处于离线状态时，也能保证机密性、真实性和可用性。我们实现并评估了一个适用于 Chainspace 和 Ethereum 的通用 Coconut 智能合约库；并展示了三个与匿名支付、电子请愿，以及用于抗审查的代理分发相关的应用。Coconut 使用简短且计算高效的凭证，我们的评估结果表明，大多数 Coconut 密码学原语的运行平均仅需几毫秒，其中验证耗时最长（10 毫秒）。

## I. 引言

选择性披露凭证 [16], [19] 允许向用户签发凭证，并随后以不可链接的方式披露（或“展示”）其所编码的一些属性给验证者，以用于认证、授权或实现电子现金。然而，现有的方案存在缺陷。一些方案将凭证签名密钥委托给单个签发方，这会使得恶意的签发方能够伪造任何凭证或电子货币。其他方案则无法提供实现实用化选择性披露凭证所需的效率、重新随机化或盲签发等属性。没有任何现有方案能够同时具备效率、门限分布式签发、私有属性、重新随机化，以及不可链接的多次展示选择性披露。

缺乏高效的通用选择性披露凭证会影响支持“智能合约”的平台，例如 Ethereum [53]、Hyperledger [15] 和 Chainspace [1]。它们都有一个共同的限制，即可验证的智能合约只能执行记录在公共区块链上的操作。此外，这些系统的安全模型通常假设在存在一定数量不诚实或失效节点（拜占庭容错）的情况下，仍能保持完整性；同样的假设对于多个凭证签发方（门限签发）而言也是理想的。

通过智能合约签发凭证将非常理想：智能合约可以有条件地签发凭证，取决于区块链的状态，或者证明关于通过合约操作的用户的一些声明——例如他们的身份、属性，甚至是钱包的余额。这在当前是不可能的，因为现有的选择性凭证方案要么将签发委托给单个签发方，要么无法提供足够的效率、重新随机化、盲签发和选择性披露能力（如门限签名 [3] 的情况）。例如，Hyperledger 系统通过一个受信任的第三方签发方支持 CL 凭证 [16]，这展示了它们的有用性，但也暴露了其在签发方恶意时的脆弱性。Garman 等人 [26] 提出了一种去中心化的匿名凭证系统，将其集成到分布式账本中；它们能够在没有中心化签发方的情况下签发可公开验证的声明，但并不关注门限签发或通用凭证，而且展示凭证需要昂贵的双离散对数证明。

Coconut 解决了这些挑战，它允许一部分去中心化的、互不信任的权威机构联合签发凭证，这些凭证可以是公共或私有属性的。此类凭证不能被用户或潜在的少量恶意签发方伪造。凭证在展示选定属性之前可以被重新随机化，即使在所有权威和验证者串通的情况下，也能保护隐私。Coconut 方案基于一种门限签发签名方案，该方案允许将部分声明聚合到一个单一凭证中。映射到许可链和半许可链的上下文中，Coconut 允许负责维护区块链或基于联合挂钩的侧链 [3] 的权威集合联合签发选择性披露凭证。

Coconut 使用简短且计算高效的凭证，并提供高效的属性选择性披露与验证协议。每个部分凭证和合并后的凭证都由恰好两个群元素组成。无论属性数量或权威/签发方数量多少，凭证大小保持不变。此外，在一个一次性设置阶段中，用户从权威方收集并聚合门限数量的验证密钥后，属性展示与验证在加密计算和加密材料通信方面的复杂度均为 O(1)，且与权威方数量无关。我们对 Coconut 基元的评估结果非常有前景。验证大约需要 10 毫秒，而签署私有属性的速度大约快 3 倍。当客户端从分布在全球的 10 个权威机构聚合部分凭证时，延迟约为 600 毫秒。

**贡献** 本文的三项主要贡献是：

- 我们描述了 Coconut 所基于的签名方案，包括密钥生成、分布式签发、聚合与验证签名的操作方式（第 II 和 III 节）。该方案是 Waters 签名方案 [52]、BGLS 签名 [9] 和 Pointcheval 与 Sanders 签名方案 [43] 的扩展与混合。这是我们所知的第一个支持通用、完全分布式门限签发、可重新随机化、多次展示的凭证方案。
- 我们使用 Coconut 为 Chainspace [1] 和 Ethereum [53] 实现了通用智能合约库，支持公共与私有属性签发、聚合、重新随机化与选择性披露（第 IV 节）。我们在这些平台上评估了其性能与成本（第 VI 节）。
- 我们基于 Coconut 合约库设计了三个应用：一个提供支付匿名性的币混合器；一个保护隐私的电子请愿系统；一个为抗审查系统提供代理分发的系统（第 V 节）。我们在 Chainspace 平台上实现并评估了前两个应用，并提供了安全性与性能评估（第 VI 节）。

## II. Coconut 概述

<p style="text-align:center"><img src="./1.jpg" alt="bug"/></p>

<p style="text-align:center">图 1：Coconut 架构的高级概览</p>

Coconut 是一种选择性披露凭证系统，支持门限凭证签发（包括公共和私有属性）、凭证的重新随机化以支持多次不可链接的披露，以及有选择性地披露部分属性的能力。它被嵌入到一个智能合约库中，可以由其他合约调用来签发凭证。

Coconut 的体系结构如图 1 所示。任何 Coconut 用户都可以向一组 Coconut 签发机构发送一个 **request** 命令；该命令指定一组要写入凭证的公共属性或加密的私有属性（①）。然后，每个权威机构用一个 **issue** 命令进行回应，交付一个部分凭证（②）。任何用户都可以收集到门限数量的份额，将它们聚合成一个单一的合并凭证，并对其进行重新随机化（③）。凭证在认证中的用途仅限于知道凭证中嵌入的私有属性（例如私钥）的用户。拥有凭证的用户可以执行 **show** 协议，有选择性地披露属性或关于这些属性的声明（④）。展示协议是公开可验证的，并且可能会被公开记录。

Coconut 具有以下设计目标：

- **门限权威机构（Threshold authorities）**：只需要一部分权威机构来签发部分凭证，以便允许用户生成一个合并凭证。**request** 和 **issue** 协议的通信复杂度是 O(t)，其中 t 是权威机构子集的大小。此外，从少于 t 个部分凭证生成合并凭证是不可能的。
- **盲签发与不可链接性（Blind issuance & Unlinkability）**：权威机构在签发凭证时不会获知凭证中嵌入的私有属性的任何额外信息。此外，不可能将同一凭证的多次展示相互关联，也不能将其与签发记录关联，即便所有权威机构串通（参见 III-B 节）。
- **非交互性（Non-interactivity）**：权威机构可以彼此独立运行，只需进行一次简单的密钥分发和设置阶段来就公共安全与密码参数达成一致——它们不需要同步或进一步协调活动。
- **活性（Liveness）**：只要有一个门限数量的权威机构保持诚实，并且密钥分发满足弱同步假设 [33]，Coconut 就能保证活性。
- **高效性（Efficiency）**：凭证及协议中涉及的所有零知识证明都是简短且计算高效的。在聚合和重新随机化之后，属性展示与验证仅涉及一个单一的合并凭证，因此在加密计算和加密材料通信方面的复杂度都是 O(1)，与权威机构数量无关。
- **短凭证（Short credentials）**：每个部分凭证以及合并凭证都由恰好两个群元素组成，无论权威机构数量或凭证中嵌入的属性数量是多少。

因此，可以使用大量权威机构来签发凭证，而不会显著影响效率。

## III. Coconut 构造

我们逐步介绍支持 Coconut 架构的密码学原语，从 Pointcheval 和 Sanders [43] 以及 Boneh 等人 [10], [9] 的设计开始，最终到完整的 Coconut 方案。

- **步骤 1**：我们首先回顾（III-C 节）Pointcheval 等人 [43] 针对单属性凭证的方案。我们介绍了该方案的局限性——这些局限性阻碍了它满足第二节中提出的设计目标，并展示了如何结合 Boneh 等人 [10] 的原理来克服这些局限。
- **步骤 2**：我们引入（III-D 节）Coconut 门限凭证方案，该方案同时具备 Pointcheval 和 Sanders [43] 以及 Boneh 等人 [10] 的所有特性，并使我们能够实现所有的设计目标。
- **步骤 3**：最后，我们扩展（III-E 节）我们的方案，以支持同时嵌入 qqq 个不同属性 (m1,…,mq)(m_1, \ldots, m_q)(m1,…,mq) 的凭证。

### A. 符号与假设

我们在本文其余部分中使用以下符号，以及我们的原语所依赖的安全性假设。

#### a) 零知识证明

我们的凭证方案使用**非交互式零知识证明**来断言在离散对数值上的知识与关系。我们使用 Camenisch 等人 [17] 引入的符号来表示这些非交互式零知识证明：
$$
\text{NIZK}\{(x, y, \ldots) : \text{statements about } x, y, \ldots \}
$$
这表示在零知识下证明秘密值 $(x, y, \ldots)$（所有其他值是公开的）满足冒号后给出的声明。

#### b) 密码学假设

Coconut 需要素数阶 $p$ 的群 $(\mathbb{G}_1, \mathbb{G}_2, \mathbb{G}_T)$，以及双线性映射 $e: \mathbb{G}_1 \times \mathbb{G}_2 \to \mathbb{G}_T$ 并满足以下性质：

1. **双线性性**（Bilinearity）：对所有 $g_1 \in \mathbb{G}_1, g_2 \in \mathbb{G}_2$ 以及 $a, b \in \mathbb{F}_p^2$，有

   $e(g_1^a, g_2^b) = e(g_1, g_2)^{ab}$

2. **非退化性**（Non-degeneracy）：对所有 $g_1 \in \mathbb{G}_1, g_2 \in \mathbb{G}_2$，有 $e(g_1, g_2) \neq 1$。

3. **高效性**（Efficiency）：映射 $e$ 是可高效计算的。

4. 此外，$\mathbb{G}_1 \neq \mathbb{G}_2$，并且在 $\mathbb{G}_1$ 和 $\mathbb{G}_2$ 之间不存在高效同态映射。类型 3 配对是高效的 [25]。它们支持 XDH 假设，即在 $\mathbb{G}_1$ 和 $\mathbb{G}_2$ 中的计算型协同 Diffie-Hellman（co-CDH）问题，以及在 $\mathbb{G}_1$ 中的判定型 Diffie-Hellman（DDH）问题都是困难的 [10]。

Coconut 还依赖于一个密码学安全的哈希函数 $H$，将 $\mathbb{G}_1$ 的一个元素哈希到 $\mathbb{G}_1$ 的另一个元素上，即
$$
H: \mathbb{G}_1 \to \mathbb{G}_1
$$
我们实现该函数的方法是序列化输入点的 $(x, y)$ 坐标，并应用一个全域哈希函数将此字符串哈希为 $\mathbb{G}_1$ 的一个元素（如 Boneh 等人 [10] 所述）。

#### c) 门限与通信假设

Coconut 假设诚实多数（$n/2 < t$）以防止恶意权威机构任意签发凭证。Coconut 权威机构之间不需要通信；用户等待 $t$ 份（按任意顺序或到达时间）回复后，将它们聚合为一个合并凭证；因此，Coconut 隐式假设是一个异步环境。然而，我们当前的实现依赖 Kate 等人 [33] 的分布式密钥生成协议，该协议要求（i）弱同步性以保证活性（但不是安全性），以及（ii）最多不超过三分之一的不诚实权威机构。

### B. 方案定义与安全性质

我们给出构成门限凭证方案的协议：

- **Setup**$(1^\lambda) \rightarrow (\text{params})$：定义系统参数 $\text{params}$，该参数依赖于安全参数 $\lambda$。这些参数是公开可用的。
- **KeyGen**$(\text{params}) \rightarrow (\text{sk}, \text{vk})$：由权威机构运行，根据公开的 $\text{params}$ 生成其私钥 $\text{sk}$ 和验证密钥 $\text{vk}$。
- **AggKey**$(\text{vk}_1, \ldots, \text{vk}_t) \rightarrow (\text{vk})$：由希望验证凭证的任意方运行，将任意 $t$ 个验证密钥 $\text{vk}_i$ 聚合成一个单一的合并验证密钥 $\text{vk}$。AggKey 只需运行一次。
- **IssueCred**$(m, \phi) \rightarrow (\sigma)$：这是用户与每个权威机构之间的交互协议，用户获得一个凭证 $\sigma$，其中嵌入了满足声明 $\phi$ 的私有属性 $m$。
- **AggCred**$(\sigma_1, \ldots, \sigma_t) \rightarrow (\sigma)$：由用户运行，将任意 $t$ 个部分凭证 $\sigma_i$ 聚合成一个单一的合并凭证。
- **ProveCred**$(\text{vk}, m, \phi') \rightarrow (\Theta, \phi')$：由用户运行，计算一个证明 $\Theta$，证明其拥有一个凭证，该凭证证明私有属性 $m$ 满足声明 $\phi'$（基于对应的验证密钥 $\text{vk}$）。
- **VerifyCred**$(\text{vk}, \Theta, \phi') \rightarrow (\text{true/false})$：由希望验证凭证的任意方运行，验证凭证中嵌入的私有属性是否满足声明 $\phi'$，使用验证密钥 $\text{vk}$ 和由 ProveCred 生成的密码材料 $\Theta$。

一个门限凭证方案必须满足以下安全性质：

- **不可伪造性（Unforgeability）**：对于对手用户来说，应该无法说服一个诚实的验证者相信其持有一个实际上并没有的凭证（即，他们没有从至少 $t$ 个权威机构获得有效的部分凭证）。
- **盲性（Blindness）**：对于对手权威机构来说，在执行 IssueCred 协议期间，不应能够获得关于属性 $m$ 的任何信息，除了它满足声明 $\phi$ 这一事实。
- **不可链接性 / 零知识（Unlinkability / Zero-knowledge）**：对于对手验证者（可能与对手权威机构协作）来说，应该无法获得关于属性 $m$ 的任何信息，除了它满足 $\phi'$ 之外；也无法将一次 ProveCred 协议的执行与另一次 ProveCred 协议的执行相联系，或者将 ProveCred 协议的执行与 IssueCred 协议（对于给定的属性 $m$）的执行相联系。

### C. Coconut 的基础

在给出完整的 Coconut 构造之前，我们首先回顾由 Pointcheval 和 Sanders [43] 提出的凭证方案；它们的构造具有与 CL 签名 [16] 相同的性质，但效率更高。该方案在三型双线性群 $(\mathbb{G}_1, \mathbb{G}_2, \mathbb{G}_T)$ 中工作，双线性映射为 $e: \mathbb{G}_1 \times \mathbb{G}_2 \rightarrow \mathbb{G}_T$ 如 III-A 节所述。

* **P.Setup**$(1^\lambda) \rightarrow (\text{params})$：选择一个阶为 $p$ 的双线性群 $(\mathbb{G}_1, \mathbb{G}_2, \mathbb{G}_T)$，其中 $p$ 是一个 $\lambda$-位的素数。令 $g_1$ 为 $\mathbb{G}_1$ 的生成元，$g_2$ 为 $\mathbb{G}_2$ 的生成元。系统参数为$\text{params} = (\mathbb{G}_1, \mathbb{G}_2, \mathbb{G}_T, p, g_1, g_2)$。

- **P.KeyGen**$(\text{params}) \rightarrow (\text{sk}, \text{vk})$：选择一个随机的私钥 $\text{sk} = (x, y) \in \mathbb{F}_p^2$。解析参数 $\text{params} = (\mathbb{G}_1, \mathbb{G}_2, \mathbb{G}_T, p, g_1, g_2)$，并公开验证密钥 $\text{vk} = (g_2, \alpha, \beta) = (g_2, g_2^x, g_2^y)$。

- **P.Sign**$(\text{params}, \text{sk}, m) \rightarrow (\sigma)$：解析 $\text{sk} = (x, y)$。选择一个随机数 $r \in \mathbb{F}_p$，并令 $h = g_1^r$。输出 $\sigma = (h, s) = (h, h^{x+ym})$。
- **P.Verify**$(\text{params}, \text{vk}, m, \sigma) \rightarrow (\text{true/false})$：解析 $\text{vk} = (g_2, \alpha, \beta)$ 和 $\sigma = (h, s)$。如果 $h \neq 1$ 且 $e(h, \alpha \beta^m) = e(s, g_2)$ 则输出 **true**；否则输出 **false**。

签名 $\sigma = (h, s)$ 可以通过选择一个随机数 $r' \in \mathbb{F}_p$ 并计算 $\sigma' = (h^{r'}, s^{r'})$ 来重新随机化。上述方案可以修改以向私有属性颁发凭证：用户首先选择一个随机数 $t \in \mathbb{F}_p$，计算消息 $m$ 的承诺值 $c_p = g_1^t Y^m$ 其中 $Y = g_1^y$，并将其与一个零知识证明（用于证明该承诺的正确性）一起发送给单个权威机构。权威机构验证该证明后，选择一个随机数 $u \in \mathbb{F}_p$，返回 $\tilde{\sigma} = (h, \tilde{s}) = (g^u, (X c_p)^u)$ 其中 $X = g_1^x$。用户通过计算 $\sigma = (h, \tilde{s}(h)^{-t})$ 来取消盲化，该值即为凭证。

该方案具备盲性、不可链接性、高效性和短凭证等特性；但它不支持门限签发，因此无法满足我们的设计目标。这一限制源于 **P.Sign** 算法——签发机构使用私钥和自生成的随机数 $r$ 来计算凭证，这使得该方案无法在多权威环境中高效分布化。为克服这一限制，我们利用 BLS 签名 [10] 引入的一个概念；使用哈希函数 $H : \mathbb{F}_p \rightarrow \mathbb{G}_1$ 计算群元素 $h = H(m)$。下一节将描述 Coconut 如何结合这些概念来实现所有设计目标。

### D. Coconut 门限凭证方案

我们介绍 **Coconut** 门限凭证方案，允许用户在私有或公共属性 $m$ 上获得部分凭证 $\sigma_i$。在一个拥有 $n$ 个权威机构的系统中，一个 $t-out-of-n$ 的门限凭证方案提供了极大的灵活性，因为用户只需收集 $n/2 < t \le n$ 个部分凭证即可重新计算出合并凭证（$t$ 和 $n$ 都是方案参数）。

#### a) 密码学原语

为了简单起见，我们下面描述一个由可信第三方执行的密钥生成算法 **TTPKeyGen**；该协议也可以通过分布式方式执行，例如 Gennaro 等人 [27] 所示的同步假设下，或者 Kate 等人 [33] 所示的弱同步假设下。增加或移除权威机构需要重新运行密钥生成算法——这种限制继承自底层 Shamir 秘密共享协议 [48]，可以通过 Herzberg 等人 [29] 引入的技术进行缓解。

------

- **Setup**$(1^\lambda) \rightarrow (\text{params})$：选择一个阶为 $p$ 的双线性群 $(\mathbb{G}_1, \mathbb{G}_2, \mathbb{G}_T)$，其中 $p$ 是一个 $\lambda$ 位的素数。令 $g_1, h_1$ 为 $\mathbb{G}_1$ 的生成元，$g_2$ 为 $\mathbb{G}_2$ 的生成元。系统参数为 $\text{params} = (\mathbb{G}_1, \mathbb{G}_2, \mathbb{G}_T, p, g_1, g_2, h_1)$。

- **TTPKeyGen**$(\text{params}, t, n) \rightarrow (\text{sk}, \text{vk})$：选择两个次数为 $t-1$ 的多项式 $v, w$，其系数在 $\mathbb{F}_p$ 中，并设 $(x, y) = (v(0), w(0))$。为每个权威机构 $i \in [1, \ldots, n]$ 分配私钥 $\text{sk}_i = (x_i, y_i) = (v(i), w(i))$ 并公开验证密钥 $\text{vk}_i = (g_2, \alpha_i, \beta_i) = (g_2, g_2^{x_i}, g_2^{y_i})$。

- **IssueCred**$(m, \phi) \rightarrow (\sigma)$：凭证签发由三个算法组成：

  * **PrepareBlindSign**$(m, \phi) \rightarrow (d, \Lambda, \phi)$：用户生成一个 El-Gamal 密钥对 $(d, \gamma = g_1^d)$；选择一个随机数 $o \in \mathbb{F}_p$，计算承诺值 $c_m$ 和群元素 $h \in \mathbb{G}_1$:
    $$
    c_m = g_1^m h_1^o \ \ \ \ \ and \ \ \ \ \ h = H(c_m)
    $$
    随机选择 $k \in \mathbb{F}_p$，计算 $m$ 的 El-Gamal 加密：
    $$
    c = Enc(h^m) = (g_1^k, \gamma^k h^m)
    $$
    输出 $(d, \Lambda = (\gamma, c_m, c, \pi_s), \phi)$，其中 $\phi$ 是 $m$ 满足的应用特定谓词，$\pi_s$ 为零知识证明：
    $$
    \pi_s = NIZK\{(d, m, o, k) : \gamma = g_1^d \wedge c_m = g_1^m h_1^o \wedge c = (g_1^k, \gamma^k h^m) \wedge \phi(m) = 1\}
    $$

  * **BlindSign**$(\text{sk}_i, \Lambda, \phi) \rightarrow (\tilde{\sigma}_i)$：权威 $i$ 解析 $\Lambda = (\gamma, c_m, c, \pi_s)$，$\text{sk}_i = (x_i, y_i)$，以及 $c = (a, b)$，重新计算 $h = H(c_m)$ 并用 $\gamma, c_m, \phi$ 验证 $\pi_s$。若验证通过，构造 $\tilde{c}_i = (a^{y}, h^{x_i} b^{y_i})$ 输出 $\tilde{\sigma}_i = (h, \tilde{c}_i)$；否则输出 $⊥$ 并终止协议。

  * **Unblind**$(\tilde{\sigma}_i, d) \rightarrow (\sigma_i)$：用户解析 $\tilde{\sigma}_i = (h, \tilde{c})$ 和 $\tilde{c} = (\tilde{a}, \tilde{b})$，计算 $\sigma_i = (h, \tilde{b}(\tilde{a})^{-d})$ 输出 $\sigma_i$。

* **AggCred**$(\sigma_1, \ldots, \sigma_t) \rightarrow (\sigma)$：解析每个 $\sigma_i = (h, s_i)$，输出$(h, \prod_{i=1}^t s_i^{l_i})$ 其中 $l$ 为拉格朗日系数：
  $$
  l_i = \left[ \prod_{j=1, j \neq i}^t (0-j) \right] \cdot \left[ \prod_{j=1, j \neq i}^t (i-j) \right]^{-1} \bmod p
  $$

* **ProveCred**$(\text{vk}, m, \sigma, \phi') \rightarrow (\Theta, \phi')$：解析 $\sigma = (h, s)$ 和 $\text{vk} = (g_2, \alpha, \beta)$，随机选择 $r', r \in \mathbb{F}_p^2$，令 $\sigma' = (h', s') = (h^{r'}, s^{r'})$，构造 $\kappa = \alpha \beta^m g_2^r$，$\nu = (h')^r$，输出 $\Theta = ((\kappa, \nu, \sigma', \pi_v), \phi')$，其中 $\phi'$ 是一个由 $m$ 满足的特定应用谓词， $\pi_v$ 则是零知识证明：
  $$
  \pi_v = NIZK\{(m, r) : \kappa = \alpha \beta^m g_2^r \wedge \nu = (h')^r \wedge \phi'(m) = 1\}
  $$

- **VerifyCred**$(\text{vk}, \Theta, \phi') \rightarrow (\text{true/false})$：解析 $\Theta = (\kappa, \nu, \sigma', \pi_v)$ 和 $\sigma' = (h', s')$，使用 $\text{vk}$ 和 $\phi'$ 验证 $\pi_v$。若验证成功且 $h' \neq 1$ 且 $e(h', \kappa) = e(s'\nu, g_2)$，则输出 **true**，否则输出 **false**。

#### b) 正确性与说明

**Setup** 算法生成公共参数。凭证是 $\mathbb{G}_1$ 的元素，而验证密钥是 $\mathbb{G}_2$ 的元素。图 2 展示了协议交互过程。

<p style="text-align:center"><img src="./2.jpg" alt="bug"/></p>

<p style="text-align:center">图 2：Coconut 门限凭证协议交互过程</p>

为了使属性 $m \in \mathbb{F}_p$ 对权威机构保密，用户运行 **PrepareBlindSign** 生成 $\Lambda = (\gamma, c_m, c, \pi_s)$。他们创建一个 El-Gamal 密钥对 $(d, \gamma = g_1^d)$，选择一个随机数 $o \in \mathbb{F}_p$，并计算承诺值 $c_m = g_1^m h_1^o$。然后，用户计算 $h = H(c_m)$ 以及 $h^m$ 的加密：
$$
c = Enc(h^m) = (a, b) = (g_1^k, \gamma^k h^m)，其中 \ k \in \mathbb{F}_p
$$
最后，用户将 $(\Lambda, \phi)$ 发送给签发者，其中 $\pi_s$ 是一个零知识证明，用于证明 $m$ 满足应用特定谓词 $\phi$，并且 $\gamma, c_m, c$ 的正确性（①）。Coconut 所需的所有零知识证明均基于标准 sigma 协议，用于展示离散对数表示的知识；它们基于 DH 假设 [17]，且不需要任何可信设置。

为了对属性进行盲签名，每个权威 $i$ 验证证明 $\pi_s$，并利用 El-Gamal 的同态性质生成加密
$$
\tilde{c} = (a^y, h^{x_i} b^{y_i}) = (g_1^{ky_i}, \gamma^{ky_i} h^{x_i + y_i \cdot m})
$$
需要注意的是，每个权威必须在相同的元素 $h$ 上进行操作。从直观上看，从 $h = H(c_m)$ 生成 $h$ 等价于计算 $h = g_1^{\tilde{r}}$，其中 $\tilde{r} \in \mathbb{F}_p$ 对用户来说是未知的（如 Pointcheval 和 Sanders [43] 所述）。然而，由于 $h$ 是确定性的，每个权威都可以独立地推导它，并防止伪造，因为不同的 $m_0$ 和 $m_1$ 不可能导致相同的 $h$。正如 III-C 节中所述，Pointcheval 和 Sanders 的盲签名方案直接从属性的承诺构造凭证，并由权威机构秘密选择一个盲化因子；这不适合门限凭证的签发。我们通过在方案中引入 El-Gamal 密文 $c$ 并利用其同态性来规避此问题，如上所述。

当用户收到 $\tilde{c}$ 时，他们使用 El-Gamal 私钥 $d$ 解密它，以恢复部分凭证 $\sigma_i = (h, h^{x_i + y_i \cdot m})$。此过程由 **Unblind** 算法（②）执行。然后，用户可以调用 **AggCred** 算法来聚合任意 $t$ 个部分凭证。该算法使用拉格朗日基多项式 $l$，可通过多项式插值重构原始的 $v(0)$ 和 $w(0)$：
$$
v(0) = \sum_{i=1}^t v(i) l_i \quad\text{以及}\quad w(0) = \sum_{i=1}^t w(i) l_i
$$
