---
title: 使用我的函数就应遵循我的检查：理解并检测智能合约中的不安全 OpenZeppelin 代码
date: 2025-04-21
tags: 
  - 静态代码分析
  - 区块链
  - 智能合约
  - 以太坊
  - 合约缺陷检测
  - 字节码分析
  - 符号执行
categories: 
  - 论文阅读
---

# 使用我的函数就应遵循我的检查：理解并检测智能合约中的不安全 OpenZeppelin 代码

## 摘要

OpenZeppelin 是一种在构建智能合约时广受欢迎的框架。它提供了诸如 SafeMath 之类的常用库、以太坊标准（如 ERC20）实现，以及用于访问控制和可升级性的可复用组件。然而，与传统软件库通常以静态链接或动态加载方式被引入不同，OpenZeppelin 在 Solidity 合约中是以**源代码**形式使用的。因此，开发者往往会对各自拷贝的 OpenZeppelin 代码进行定制化修改，这可能产生意料之外的安全后果。

在本文中，我们首次对**现实世界合约中 OpenZeppelin 代码的安全性**进行了系统化研究。我们特别关注官方 OpenZeppelin 库中的安全检查，并检验这些检查在真实合约的相关 OpenZeppelin 函数中是否得到忠实执行。为此，我们提出了新工具 **ZepScope**，由两大组件组成：**MINER** 和 **CHECKER**。首先，**MINER** 分析官方 OpenZeppelin 函数，提取**显式检查**（即函数内部定义的检查）与**隐式检查**（即调用函数时应满足的条件）之事实。随后，基于 MINER 提取的事实，**CHECKER** 在真实合约中定位 OpenZeppelin 函数，将其检查与事实进行匹配，并验证不一致检查所带来的后果。通过克服开发 ZepScope 的多项挑战，我们不仅构建了**首个 OpenZeppelin 检查分类体系**，还对来自三条主流区块链的 **35 882 份热门合约**进行了全面检查并给出了结果。

## 1 引言

智能合约 [9]——即运行在区块链上的软件程序——近年来迅速崛起，被广泛应用于去中心化金融（DeFi） [54]、非同质化代币（NFT） [25]等场景。鉴于区块链的不可变特性，一旦部署，智能合约就无法修改，并将在平台存续期间持续生效。这意味着任何漏洞都无法在不重新部署新版合约的情况下得到修复。智能合约中的安全缺陷可能导致巨额经济损失；2023 年发生的 *insufficient_check* 攻击便造成了 700 万美元损失 [2]。因此，在部署前确保智能合约安全至关重要。

为促进代码标准化并缓解安全问题，OpenZeppelin [15] 提供了诸如 SafeMath 等通用库、ERC20 [6] 等以太坊标准实现，以及访问控制和可升级性的可复用组件。一项研究 [34] 表明，36.3 %的已验证合约使用了 OpenZeppelin 代码。与传统编程环境通过静态或动态链接导入库不同，Solidity 中的 OpenZeppelin 通常以**克隆源码**的方式嵌入合约。开发者还可能对这些拷贝代码进行修改或嵌入自定义逻辑，从而产生意想不到的安全后果并带来重大财务风险 [18, 19]。

本文旨在系统性地研究真实世界合约中 OpenZeppelin 代码的安全性。我们聚焦于官方 OpenZeppelin 函数的两类安全检查，并检验它们在实际合约相关函数中是否得到忠实执行：一类是显式检查，即函数本体及其被调用函数中的 require 和 modifier 语句；另一类是隐式检查，即调用函数时需满足的前置条件（如调用内部 OpenZeppelin 函数时的默认角色检查）。为审查这些检查，我们提出了新工具 **ZepScope**，由 **Miner** 与 **Checker** 两个组件组成。

**Miner** 负责分析完整的 OpenZeppelin 库，以提取显式定义检查与隐式调用检查的事实。在此过程中，它克服了两大挑战：(i) 通过过程间别名分析应对检查事实在调用链中以多种形式出现的问题；(ii) 综合代码上下文与数据流信息，为可能交织在单个调用函数中的不同调用检查事实判定相关性。运行 Miner 后，我们获得了 1 435 条 OpenZeppelin 检查事实，并将其整理为包含四大类别、三级严重度的分类体系，详见 §4.6。

基于 Miner 提取的事实，**Checker** 在真实合约中检测不安全的 OpenZeppelin 代码。具体而言，Checker 首先依据函数签名与合约结构信息识别目标 OpenZeppelin 类函数，然后从中提取三类检查：require、if‑revert 以及 modifier 检查。随后，Checker 通过自定义相似度度量将提取到的代码检查与 OpenZeppelin 检查事实进行匹配，并验证潜在不安全代码的安全后果，判断攻击者是否可实际利用。

为全面评估 ZepScope 的有效性与实用性，我们同时进行了基准实验与大规模实验。在包含 51 个真实安全漏洞的基准实验中，我们将 ZepScope 的基于事实检测方法与三款最新 SOTA 工具 [27, 28, 31] 的基于模式检测方法进行比较（详见 §6.1）。结果表明，ZepScope 在检测与 OpenZeppelin 检查相关的漏洞类型上显著优于现有工具，这归功于其对 OpenZeppelin 检查事实的深入理解与利用。

在针对三条主流以太坊兼容链、共 35 882 份合约的大规模实验中，我们评估了 ZepScope 的准确性与性能。ZepScope 共分析 2 750 165 个函数，标记出 47 431 个可能包含不安全 OpenZeppelin 代码的函数，平均每份合约仅产生约 1 条告警，便于现实场景下的人工审查（其中 39 225 条为缺失零地址检查等低级告警）。由于缺乏完整的真实标签，我们随机抽取每条链各 100 条告警进行人工核查，共 300 条告警中 31 条为误报，整体准确率达 89.67%。此外，ZepScope 人均分析时间为 42.39 秒/合约，证明了其适用于大规模链上扫描。

大规模实验还揭示了四项重要安全发现。首先，在过滤并人工审查与角色检查相关的高层级告警后，我们确认了 15 个新漏洞。其次，我们发现 OpenZeppelin 相关代码普遍缺失零地址检查，共 22 448 个函数存在此问题；尽管这不会直接触发漏洞，我们在 §6.3 中提出了威胁模型，说明该疏忽可被利用进行有效钓鱼攻击。第三，我们在 BSC 链上发现了一场涉及 255 份合约的有趣活动，其特意放宽 OpenZeppelin 检查以满足自身逻辑。最后，我们探讨了三条链之间 OpenZeppelin 安全检查的差异；详见 §6.4。

**Availability.** 我们已在 https://zepscope.github.io/ 公开了代码、数据集及全部评估结果。

## 2 背景

### 2.1 面向智能合约的 OpenZeppelin

OpenZeppelin [15] 是构建安全智能合约最流行的软件包之一。它汇集了一套高质量、可复用的智能合约，可用于在以太坊上构建去中心化应用（DApp）和协议。例如，OpenZeppelin 提供了 ERC20 [6] 用于同质化代币、ERC721 [7] 用于非同质化代币，以及 ERC777 [8] 用于高级代币等实现。这些库持续演进并更新，以加入新特性并修复安全问题。OpenZeppelin 中的智能合约采用 Solidity 编写，库中还包含接口、抽象类以及虚函数，开发者可根据自身需求进行修改和实现。此外，OpenZeppelin 为每个 API 制定了一组要求，说明如何避免常见安全漏洞（如访问控制问题以及算术溢出或下溢），这些漏洞可能导致用户资产损失。然而，并非所有开发者都会遵循这些要求，这导致其智能合约出现安全漏洞 [18, 19]。

### 2.2 一个激励性示例

下面借助 Code4rena 审计报告中的一个真实漏洞 [1]，说明 OpenZeppelin 在名为 NFTX 的合约中如何被误用。Figure 6 展示了 OpenZeppelin 中 ERC20FlashMint 的原始 `flashLoan` 函数，而 Figure 1 则给出了 NFTX 中的易受攻击版本，它实现了 OpenZeppelin `flashLoan` 的简化版（具体来说省略了 `flashFeeReceiver`）。在 ERC20FlashMint 的 `flashLoan` 函数中，第 7 行通过金额检查将 `amount` 严格限制在 `maxFlashLoan(token)` 以下，确保 `amount + fee` 不会溢出。然而，NFTX 的 `flashLoan` 函数缺乏此检查，允许消息发送者任意指定 `amount`。攻击者可在第 10 行构造需铸造的 `amount`，导致 `amount + fee` 溢出为极小值甚至 0（从而绕过第 13 行的检查），间接使得能够铸造大量代币，而仅有少量在第 15 行被销毁。尽管 Solidity 0.8.0 及以上版本已内置算术溢出检查，NFTX 仍运行在 Solidity 0.6.8，因此仍易受此类攻击。

```solidity
1  function flashLoan(
2      IERC3156FlashBorrowerUpgradeable receiver,
3      address token,
4      uint256 amount,
5      bytes memory data
6  ) public virtual override returns (bool) {
7      // 漏洞点：缺少原 OpenZeppelin 库（图 6 第 7 行）的金额检查
8      uint256 fee = flashFee(token, amount);
9      _mint(address(receiver), amount);
10     require(receiver.onFlashLoan(msg.sender,
11         token, amount, fee, data) ==
12         RETURN_VALUE, "ERC20FlashMint: invalid return value");
13     uint256 currentAllowance = allowance(
14         address(receiver), address(this));
15     require(currentAllowance >= amount + fee,
16         "ERC20FlashMint: allowance does not allow refund");
17     _approve(address(receiver), address(this),
18         currentAllowance - amount - fee);
19     _burn(address(receiver), amount + fee);
20     return true;
21 }
```

<p style="text-align:center">Figure 1: NFTX 中存在漏洞的 flashLoan 函数。</p>

## 3 ZepScope 概述

<p style="text-align:center"><img src="./2.png" alt="bug"/></p>

<p style="text-align:center">Figure 2：ZepScope 的工作流</p>

在本节中，我们概述 ZepScope——首个旨在提取 OpenZeppelin 事实并检测其在智能合约中违规使用情况的工具。如 Figure 2 所示，ZepScope 由两个组件构成：**MINER** 和 **CHECKER**。其中，MINER 负责从官方 OpenZeppelin 库中挖掘检查事实，而 CHECKER 则基于 MINER 提取的事实，在真实合约中检测不安全的 OpenZeppelin 代码。ZepScope 的工作流程包括三个主要阶段：

**首先**，我们从官方代码库收集 OpenZeppelin 源码。本研究启动时，采用的是最新可用版本 4.9.3。

**其次**，在一次性的离线分析过程中，MINER 对 OpenZeppelin 库进行解析，提取两类与函数检查相关的事实：其一称为 *Function Definition Facts*（函数定义事实），其二称为 *Function Call Facts*（函数调用事实）。在 MINER 提取完两类检查之后，为提升事实的准确性与相关性，我们对其进行了人工复核，并在此基础上提出了 OpenZeppelin 检查的分类体系。

**第三**，在在线分析阶段，CHECKER 在真实合约中检测不安全的 OpenZeppelin 代码。具体而言，CHECKER 首先在合约内识别目标函数，然后依据 MINER 提取的事实，检验这些目标函数是否包含不安全的 OpenZeppelin 代码。CHECKER 还通过验证潜在不安全代码能否被攻击者利用，来评估其安全后果。

接下来，我们将在 **§4** 和 **§5** 分别介绍 MINER 与 CHECKER 的详细设计。

## 4 挖掘 OpenZeppelin 函数检查

### 4.1 提取事实的挑战

如 §3 所述，关于 OpenZeppelin 函数检查共有两类事实：**定义检查事实**，记为 $Fact_{Def}$；**调用检查事实**，记为 $Fact_{Call}$。在不牺牲清晰度的前提下，我们用下列形式来表达这些事实

```
Func_caller{check_caller; Func_target();}
Func_target{check_target; Func_callee();}
Func_callee{check_callee; Operation;}
```

对于给定目标函数 $Func_{target}$，其 $Fact_{Def}$ 被定义为 $check_{target}+check_{callee}$，而 $Fact_{Call}$ 则由 $check_{caller}$ 表示。需要注意的是，在 $Fact_{Call}$ 的场景中，显式的 $check_{caller}$ 可能不存在；对于 `internal` 函数，它往往体现为隐式的 *owner* 检查。更多细节见 §4.4。

尽管定义看似直接，实际抽取事实却颇具复杂性。具体来说，**MINER** 需要解决以下两大挑战：

**C1：$Fact_{Def}$ 可在完整调用链上以多种形式出现。**
例如，Figure 4 中展示了 `transfer` 函数的 $Fact_{Def}$ 位于被调函数 `_transfer` 内；第 11 行最初的事实形态为

```
["GTE", "fromBalance", "amount", "ERC20: transfer amount exceeds balance"]
```

然而，它无法与 Figure 5 中第 4 行提取的检查

```
["GTE", "balance", "value", "AnyswapV6ERC20: transfer amount exceeds balance"]
```

直接匹配。实际上，事实与检查都必须沿调用链向上传播，以获得其它形态，最终才可彼此对应。相关细节见 §4.2 与 §4.3。

**C2：不同的 $Fact_{Call}$ 可能交织在同一调用方函数中，难以区分。**
假设调用方函数形式为

```
Func_caller{check_a; Func_a(); check_b; Func_b();}
```

通常可以判定 $check_a$ 对应 $Func_a$，$check_b$ 对应 $Func_b$；但要进一步确认 $check_a$ 是否也与 $Func_b$ 相关，则更具挑战性。我们将在 §4.4 中详细讨论。

<p style="text-align:center"><img src="./3.png" alt="bug"/></p>

<p style="text-align:center">Figure 3：一个详细的 MINER 工作流</p>

为应对这些挑战，我们为 **MINER** 设计了如 Figure 3 所示的新流程。首先，MINER 借助 Slither [28] 为完整的 OpenZeppelin 库构建调用图。在此过程中，我们关注多种调用类型，包括 `internal` 调用、高层 API 调用、库调用以及诸如 `abi.encodeWithSignature` 之类的低级调用。随后，MINER 执行跨过程别名分析，提取 $Fact_{Def}$ 与 $Fact_{Call}$，并对抽取的事实进行统一。后续子节将对这些步骤进行详细介绍。

### 4.2 跨过程别名分析（Inter-procedural Alias Analysis）

为解决 **C1**，我们对整个 OpenZeppelin 库执行跨过程别名分析。如 Figure 3 所示，该别名分析同时服务于两个事实抽取模块，使它们能够专注于当前检查本身，而不必担心检查形式的差异。

```solidity
1  function transfer(address to, uint256 amount)
2      public virtual override returns (bool) {
3          address owner = _msgSender();
4          _transfer(owner, to, amount);
5          return true;
6  }
7  function _transfer(address from, address to,
8      uint256 amount) internal virtual {
9      require(from != address(0), "ERC20:
10             transfer from the zero address");
11     require(to   != address(0), "ERC20:
12             transfer to the zero address");
13     uint256 fromBalance = _balances[from];
14     require(fromBalance >= amount, "ERC20:
15             transfer amount exceeds balance");
16     ...
17 }
```

<p style="text-align:center">Figure 4：OpenZeppelin 库中的 transfer 与 _transfer 函数</p>

基于 Slither 构建的调用图，**MINER** 首先将 OpenZeppelin 库中的函数调用进行内联。随后，它遍历每个函数的节点；对每一次函数调用，都会将调用方函数节点加入遍历集合。接着，**MINER** 遍历集合中的赋值语句，将赋值表达式两侧的变量记录为等价变量对。对于右值（*rvalue*）表达式，**MINER** 仅记录经过字符串化（stringified）的表达式，因为此类表达式即便被进一步处理也不会影响等价变量集合。由此可获得成对的等价变量，例如 Figure 4 中的 `fromBalance` 与 `_balances[from]`。

```solidity
1  function transfer(address to, uint256 value)
2      external override returns (bool) {
3      require(to != address(0) && to != address(
4              this));
5      uint256 balance = balanceOf[msg.sender];
6      require(balance >= value,
7              "AnyswapV6ERC20:
8               transfer amount exceeds balance");
9      balanceOf[msg.sender] = balance - value;
10     balanceOf[to]        += value;
11     emit Transfer(msg.sender, to, value);
12     return true;
13 }
```

<p style="text-align:center">Figure 5：某合约中示例性的 transfer 函数</p>

此外，我们将别名分析从语句级扩展到过程级。例如，根据跨过程别名分析，第 3 行中的变量 `owner` 与函数 `_transfer` 的参数 `from` 等价。我们的别名分析还会在共享同一变量的不同行集合之间传播别名关系，如集合 `{fromBalance, _balances[from]}` 与集合 `{from, owner}` 之间的传播。结果表明，`fromBalance` 亦等价于 `_balances[owner]`，进而等价于 `_balances[owner]`、`_balances[_msgSender()]` 与 `_balances[msg.sender]`。这样，$Fact_{Def}$ 中的 `_balances[msg.sender]` 部分即可与 Figure 5 提取的检查中的 `balanceOf[msg.sender]` 高度匹配，从而解决 **C1**。

需要注意的是，当子串（如 `_balances[from]` 中的 `from`）被方括号等特殊符号包围时，我们会用变量本身替换该子串；在其他情况下，我们将其视为变量名的巧合重复而非等价。此外，为区分同一合约中重名的变量，我们还采用静态单赋值（SSA）命名与函数名进行区分。最终，经过递归扩展直至不再产生新的等价变量，我们得到等价变量的最终集合。

