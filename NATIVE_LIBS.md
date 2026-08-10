# 天朝小将 2.8 原生库（.so）逆向深入

> 基于 Ghidra 12.1.2 headless 反编译产物（`ghidra-decompiled\lib_arm64-v8a_*.txt`）。
> 所有地址均为 arm64-v8a 库内虚拟地址。
> 两版 APK（`com.w2a.hh74` / `com.w2a.gpsn`）的 24 个 `.so` 字节级一致，本分析通用。
> 本文档仅供网络安全学习 / 逆向研究使用。

---

## 1. 概述

APK 内共 5 个自研 `.so`（外加标准 `libc++_shared.so`），覆盖 4 个 ABI：

| 库 | 作用 | JNI 数量 |
|---|---|---|
| `libcrypto_engine` | 资产解密 / 完整性校验 / 反调试反篡改 | 5 |
| `libhardware_control` | 电源/音量键注入、闪光灯、振动、CPU 烧机 | 18 |
| `libsys_optimizer` | CPU 拓扑/大核绑定、温控、系统调优 | 8 |
| `libgo_exec_loader` | 加载执行内嵌 Go 程序 | 0（无 JNI） |
| `libnode_launcher` | 加载嵌入式 Node.js 运行时 | 0（无 JNI） |

`libgo_exec_loader` / `libnode_launcher` 无 JNI 导出，供 WebToApp 壳的「内嵌运行时」能力使用（构建/运行 Node/Go 项目）。

---

## 2. libcrypto_engine —— 解密 + 反调试反篡改

### 2.1 JNI 接口

```
Java_com_webtoapp_core_crypto_NativeCrypto_init            @ 0x00105194
Java_com_webtoapp_core_crypto_NativeCrypto_decrypt         @ 0x00105250
Java_com_webtoapp_core_crypto_NativeCrypto_verifyIntegrity @ 0x00105b4c
Java_com_webtoapp_core_crypto_NativeCrypto_clearCache      @ 0x00105c38
Java_com_webtoapp_core_crypto_NativeCrypto_getSignatureHash @ 0x00105ca8
```

### 2.2 init() —— 初始化与完整性门禁（`@ 0x00105194`）

```c
log("Initializing crypto engine");
if (isEmulator()) {            // FUN_00107440
    log("Running in emulator, skipping strict integrity checks");
    g_ok = 1;                  // 模拟器直接放行
} else {
    if (!isDebuggerAttached()       // FUN_001062e0
        && !fridaDetected()         // FUN_00106758
        && !xposedDetected()) {     // FUN_00106f40
        ok = integrityCheck();      // FUN_00106f40
        if (ok) { g_ok = 1; g_init=1; return; }
    }
    log("Integrity check failed on real device");
    g_ok = 0;
}
```

**关键行为：在模拟器环境跳过严格完整性检查**（便于开发/自动化，但也意味着模拟器上可绕过硬校验）。

### 2.3 verifyIntegrity() —— 检测矩阵（`@ 0x00105b4c`）

| 检测函数 | 日志 | 检测内容 |
|---|---|---|
| `FUN_001062e0` | "Debugger attached" | ptrace / 调试器 |
| `FUN_00106758` | "Frida detected" | Frida 框架 |
| `FUN_00106f40` | "Xposed detected" | Xposed 框架 |
| `FUN_00107ad4` | "Device is rooted" | root 权限（su 等） |
| `FUN_00107440` | "Running in emulator" | 模拟器特征 |

任一命中 → `g_ok = 0`（后续 decrypt 拒绝工作）。

### 2.4 decrypt() —— 解密流程（`@ 0x00105250`）

```c
// 门禁：模拟器或调试器 → 拒绝
if (!g_ok && !isEmulator() && isDebuggerAttached())
    log("Debugger detected, refusing to decrypt"); return 0;

// JNI 取应用包名
pkg = GetStringUTFChars(env, param4);        // JNI 偏移 0x548
ReleaseStringUTFChars(env, param4, pkg);     // JNI 偏移 0x550

// 构造密钥材料字符串：<包名>:<hex串>
str = pkg + ":" + hexEncode(签名/数据)        // 0x3a = ':'

// 密钥派生（疑似 PBKDF2）
FUN_001095f8(&key, str, salt16, saltLen, 10000, 0x20);
//         ↑ password ↑ salt  ↑ 迭代 10000  ↑ 输出 32 字节(256bit)

// ... 之后用派生密钥做 AES 解密（AES-GCM/AES-CBC，配合 16 字节 IV）
```

**重点发现：**
- 原生 `decrypt()` 的密钥派生使用 **PBKDF2，迭代 10000 次，输出 32 字节**；
- 而 Java 侧 `AesCryptoEngine.deriveKeyFromPackage`（`jadx-output`）用的是 **PBKDF2 迭代 100000 次**；
- **两套解密路径迭代次数不同（10000 vs 100000）**——原生路径更弱、更快，可作为爆破/降级攻击的突破口；
- 密钥材料 = `包名 : 签名哈希 hex`，与 Java 侧一致（绑定包名+签名证书）。

### 2.5 安全评价

- 具备较完整的**客户端防篡改**（反调试/反 Frida/Xposed/root/模拟器）；
- 但**所有校验都在客户端**，拿到 APK 源码即可 patch（如把 `isDebuggerAttached()` 返回值改 1、或绕过 `g_ok`）；
- 模拟器直接跳过硬校验 → 自动化/模拟器分析成本极低；
- 原生 PBKDF2 仅 10000 迭代，解密密钥可快速离线恢复。

---

## 3. libhardware_control —— 硬件控制 / 强制保活

### 3.1 JNI 接口（18 个）

```
nativeProbeCapabilities    nativeSetFlashlight    nativeStartStrobe / nativeStopStrobe
nativeVibrate              nativeStartContinuousVibration / nativeStopVibration
nativeStartMorseCode       nativeStartCustomPattern / nativeStopPattern
nativeSetBrightness        nativeGetMaxBrightness
nativeSetCpuPerformanceMode nativeStartCpuBurn / nativeStopCpuBurn
nativeInjectVolumeKey      nativeInjectPowerKey
nativeSetProcessPriority   nativeSetIoPriority    nativeCleanup
```

### 3.2 按键注入 —— 写 `/dev/input/event*`（`nativeInjectPowerKey @ 0x00105b80`）

```c
// 枚举 /dev/input/event* 设备
opendir("/dev/input"); readdir("event*"); open("/dev/input/eventX");
```

**电源键注入：**
```c
FUN_00105aa0(dev, 0x74, 1);   // KEY_POWER=116，按下
usleep(50000);                // 保持 50ms
FUN_00105aa0(dev, 0x74, 0);   // 松开
```

**音量键注入：** `0x72`=KEY_VOLUMEUP(114)、`0x73`=KEY_VOLUMEDOWN(115)，同样 50ms 按下-释放。

> 即通过向 Linux 输入子系统写入 `struct input_event` 模拟真实物理按键，用于**模拟用户按键行为**（配合「强制保活/挂机」场景，让系统认为有用户活动，防熄屏/防后台杀死）。

### 3.3 闪光灯 / 振动 / 频闪 / 摩斯码

- `nativeSetFlashlight` / `nativeStartStrobe`：控制相机闪光灯，支持**频闪**（Strobe）；
- `nativeVibrate` / `nativeStartContinuousVibration`：振动马达，支持持续振动；
- `nativeStartMorseCode` / `nativeStartCustomPattern`：把指定文本（摩斯码）或自定义 `{on,off}` 模式转成振动节奏。

### 3.4 CPU 烧机（`nativeStartCpuBurn @ 0x001035e4.../0x001053e4`）

```c
// 枚举 CPU 核心数（/sys/devices/system/cpu/cpu%d，最多 16，至少 2）
for (i=0; i<16 && access("/sys/devices/system/cpu/cpu%d")==0; i++);
n = max(i, 2);
// 为每个核心创建一个忙循环线程
pthread_create(..., FUN_00105518, ...);   // 忙等循环
log("CPU burn started: %d threads", n);
```

即**按核心数启动 N 个忙循环线程**刻意吃满 CPU，用于：
- 让系统误以为负载高 → 阻止后台冻结/降频；
- 提升 CPU 频率（配合温控降频对抗），维持 App 前台活跃。

### 3.5 亮度 / 性能 / 进程优先级

- `nativeSetBrightness` / `nativeGetMaxBrightness`：屏幕亮度控制（可强制提亮，配合防熄屏）；
- `nativeSetCpuPerformanceMode`：CPU 性能模式；
- `nativeSetProcessPriority` / `nativeSetIoPriority`：提升自身进程优先级（`setpriority`/`ioprio`），降低被杀概率。

### 3.6 权限要求与风险

- 写 `/dev/input` 需要 **root 或系统签名应用**（普通应用无权限）；
- 说明该 App 面向**已 root 环境 / 授权测试**，具备系统级硬件控制能力；
- 这些能力（按键注入、闪光灯频闪、持续振动、CPU 烧机）若被滥用可造成：设备异常耗电、发热、误触按键、干扰用户。

---

## 4. libsys_optimizer —— 系统调优

JNI：`nativeOptimizeSystem` / `nativeGetSystemProfile` / `nativeBindToBigCores` / `nativeBoostThread` / `nativeReadaheadFile` / `nativeGetMaxThermalTemp` / `nativeGetThermalInfo` / `nativeGetCpuTopology`

- 读取 CPU 拓扑（大小核）与**温控信息**（thermal）；
- 将线程**绑定大核**、提升线程优先级、`readahead` 预读文件；
- 综合用于「性能模式」：把 App 关键线程绑到大核 + 提权 + 预热文件，对抗降频/后台限制。

---

## 5. libgo_exec_loader / libnode_launcher —— 运行时加载

- **libgo_exec_loader**：Go 二进制加载器（无 JNI），通过 `__libc_init` 启动内嵌 Go 程序；
- **libnode_launcher**：
  ```c
  lib = getenv("WTA_NODE_LIB");            // 从环境变量取 Node 库路径
  start = dlsym(lib, "_ZN4node5StartEiPPc"); // node::Start
  if (!start) { log("node::Start symbol not found"); }
  ```
  即动态加载系统/内置 Node.js 库并启动 `node::Start`，供壳的「Node.js 运行时」能力使用。

---

## 6. 安全评价与风险汇总

| 维度 | 结论 |
|---|---|
| 客户端防护 | 反调试/Frida/Xposed/root/模拟器检测齐全，但**全在客户端可 patch** |
| 解密强度 | 原生 PBKDF2 仅 10000 迭代（比 Java 侧 100000 弱 10 倍），可离线爆破 |
| 模拟器 | 直接跳过严格完整性 → 分析成本极低 |
| 设备控制 | 具备 root 级按键注入/闪光灯/振动/CPU 烧机，属于高权限能力 |
| 与漏洞报告关联 | 原生层防护不影响游戏存档/协议层漏洞（SECURITY.md V-01~V-03），因为游戏逻辑全在 HTML 前端 |

---

（完）
