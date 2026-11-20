import { EngineeringPart } from '../types/os';

export const JARVISOS_SPECS: EngineeringPart[] = [
  {
    partNumber: 1,
    totalParts: 12,
    title: 'Part 1 of 12: Architectural Foundations, Secure Boot, & Aegis Microkernel Core',
    subtitle: 'System Topology, ARMv9-A Privilege Levels, Monorepo Layout, Fastpath Direct IPC & EAS Scheduler',
    sections: [
      {
        id: 'p1_exec',
        heading: '1.1 Executive System Overview & Privilege Topology',
        content: `JARVISOS is an original, commercial-grade, capability-based mobile operating system engineered from first principles for heterogeneous 64-bit ARM architectures (ARMv9.2-A+). It rejects the monolithic architecture of POSIX/Linux, moving all drivers and filesystems to unprivileged EL0 user space.

Execution across ARMv9 Exception Levels:
- EL0 (Unprivileged): Applications, System Servers (Display, Storage, Audio, Network), Device Drivers.
- EL1 (Privileged): Aegis Microkernel Core (Paging, Thread Scheduler, Capability Space, IPC Fastpath).
- EL2 (Hypervisor): J-Hyper Virtualization Sandboxing for cellular baseband isolation.
- EL3 (Firmware): Secure Monitor, SMC Dispatch, PSCI Power Management.
- S-EL0 / S-EL1: VaultOS Hardware Secure Enclave for biometrics, key derivation, and OTP eFuses.`,
        diagram: `+---------------------------------------------------------------------------------------+
|  EL0 (Unprivileged Userspace): System Apps, DisplayServer, NovaFS, Device Drivers     |
+---------------------------------------------------------------------------------------+
                                  | Syscall Gate (SVC #0x42)
+---------------------------------------------------------------------------------------+
|  EL1: Aegis Microkernel (CSpace Capabilities, EAS Scheduler, Fastpath Direct IPC)      |
+---------------------------------------------------------------------------------------+
                                  | Stage-2 Virtualization
+---------------------------------------------------------------------------------------+
|  EL2: J-Hyper Hypervisor (Baseband Sandboxing & Isolated Peripheral Enclaves)         |
+---------------------------------------------------------------------------------------+
|  EL3: ARM Trusted Firmware / Secure Monitor (SMC Dispatch, Hardware Handover)        |
+---------------------------------------------------------------------------------------+`,
        table: {
          headers: ['Exception Level', 'Domain', 'Components Hosted', 'Memory Isolation'],
          rows: [
            ['EL0', 'Normal World', 'Apps, System Daemons, Touch/Camera Drivers', 'Sandboxed TTBR0_EL1, MTE Tagged'],
            ['EL1', 'Normal World', 'Aegis Microkernel Core', 'Unpaged Static TTBR1_EL1, Identity Mapped'],
            ['EL2', 'Normal World', 'J-Hyper Virtualization', 'Stage-2 Translation VTTBR0_EL2'],
            ['S-EL1', 'Secure World', 'VaultOS Secure Enclave', 'Direct interface to TRNG, PUF, & eFuses'],
          ],
        },
      },
      {
        id: 'p1_boot',
        heading: '1.2 Cryptographic Chain of Trust & Verified Boot Pipeline',
        content: `JARVISOS enforces an unbreakable hardware-rooted chain of trust using hybrid post-quantum cryptography (Dilithium-3 + Ed25519) and SHA3-512 hashing.

The boot flow executes across four verified stages:
1. Boot ROM (BL1): Reads public key from silicon OTP eFuses, verifies JBL1.
2. Primary Bootloader (JBL1): Trains DDR5/LPDDR5 memory controller, brings up Secure Monitor and VaultOS.
3. Verified Bootloader (JBL2): Reads anti-rollback counter from UFS 4.0 RPMB, authenticates Aegis Kernel image.
4. Aegis Kernel Entry (EL1): Validates signed Device Tree Blob (DTB), constructs root capability CNode, drops to unprivileged init.`,
        codeSnippet: {
          language: 'c',
          code: `typedef struct __attribute__((packed)) {
    uint64_t magic;                    /* 0x534F53495652414A ("JARVISOS") */
    uint32_t header_version;           /* Layout Version 1 */
    uint32_t target_soc_id;            /* Hardware Silicon ID */
    uint64_t image_load_addr;          /* Target DRAM Physical Address */
    uint64_t image_size;               /* Binary size in bytes */
    uint32_t rollback_counter_min;     /* Minimum hardware eFuse anti-rollback counter */
    uint8_t  sha3_512_hash[64];        /* Unsigned binary SHA3-512 digest */
    uint8_t  ed25519_signature[64];    /* Primary digital signature */
    uint8_t  mldsa_signature[3293];    /* Hybrid Post-Quantum Dilithium-3 signature */
} jbl_header_t;`,
        },
      },
      {
        id: 'p1_ipc',
        heading: '1.3 Fastpath Register IPC & Direct Context Switching',
        content: `Aegis replaces slow message queues with direct CPU register transfers (X0-X7) for synchronous control IPC. The kernel swaps TTBR0_EL1 and thread execution state directly in assembly without a full scheduler pass, yielding context transfers under 100 CPU cycles.`,
        codeSnippet: {
          language: 'armasm',
          code: `aegis_ipc_fastpath_switch:
    mov     x3, sp
    str     x3, [x0, #8]                     // Save SP_EL0 of outgoing thread
    stp     x19, x20, [x0, #16]              // Save Callee-Saved Registers
    stp     x29, x30, [x0, #96]              // Save Frame Pointer & Link Register
    mrs     x4, ttbr0_el1                    // Read current address space
    cmp     x4, x2
    b.eq    1f
    msr     ttbr0_el1, x2                    // Write target translation base (New ASID)
    isb
1:  ldp     x29, x30, [x1, #96]              // Restore Incoming Context
    ldr     x3, [x1, #8]
    mov     sp, x3
    ret`,
        },
      },
    ],
  },
  {
    partNumber: 2,
    totalParts: 12,
    title: 'Part 2 of 12: NovaFS Production Filesystem & Userspace Driver Model',
    subtitle: 'Flash-Native Log-Structured Tree, Wear-Leveling, Zero-Copy Userspace Drivers, and Crash Recovery',
    sections: [
      {
        id: 'p2_novafs',
        heading: '2.1 NovaFS Structural Layout & Flash Optimization',
        content: `NovaFS is a native Copy-on-Write (CoW) log-structured storage engine designed specifically for UFS 4.0 and NVMe flash memory. It aligns with hardware flash erase blocks (2MB allocation segments) to prevent internal FTL write amplification and reduce NAND flash wear.

All disk writes append to open active segments. Inodes are tracked via a Node Address Table (NAT), and segment validity is maintained in the Segment Information Table (SIT).`,
        diagram: `+---------------------------------------------------------------------------------------+
| Superblock Ping/Pong (4KB) | Checkpoint Ping/Pong | SIT (Segment Info) | NAT (Node Address)   |
+---------------------------------------------------------------------------------------+
| Main Segment Storage Zone (2MB Segments: Inodes, ZSTD Extents, Merkle Hash Trees)     |
+---------------------------------------------------------------------------------------+`,
        table: {
          headers: ['Parameter', 'Specification', 'Rationale'],
          rows: [
            ['Block Size', '4,096 Bytes (4KB)', 'Matches MMU page size for direct zero-copy mmap'],
            ['Segment Size', '2,097,152 Bytes (2MB)', 'Matches physical flash controller erase blocks'],
            ['Compression', 'ZSTD / LZ4 Hardware', '3:1 to 4:1 compression on system extents'],
            ['Integrity', 'SHA3-512 Merkle Tree', 'Block-level authentication protects against NAND bit-flips'],
          ],
        },
      },
      {
        id: 'p2_gc',
        heading: '2.2 Garbage Collector Cost-Benefit Algorithm',
        content: `NovaFS features an intelligent garbage collector (novafs_gcd) that compacts segments without rewriting cold data unnecessarily. It utilizes a mathematical efficiency scoring model:

rho = ((1 - U) * Age) / (2 * U)

Where U is the segment utilization ratio (valid blocks / 512 total blocks) and Age is the elapsed time since last modification. Segments with maximal rho are prioritized for compaction, and hardware TRIM / ZONE_RESET commands are issued via the storage controller.`,
      },
      {
        id: 'p2_udm',
        heading: '2.3 Userspace Driver Model (UDM) & Crash Isolation',
        content: `In JARVISOS, device drivers execute entirely in EL0 userspace. If a display, camera, or touch driver crashes due to a null pointer or hardware timeout, the Aegis microkernel catches the exception, revokes its capability space, and notifies deviced. The device manager resets the hardware and respawns the driver in under 45ms without a system crash.`,
      },
    ],
  },
  {
    partNumber: 3,
    totalParts: 12,
    title: 'Part 3 of 12: Aegis Graphics Architecture, Prism Compositor, & Helios Window Manager',
    subtitle: 'HALO Hardware Abstraction, Zero-Copy hal_buffer_t, 120Hz LTPO Deadline Budget, and Dual-Kawase Blurs',
    sections: [
      {
        id: 'p3_halo',
        heading: '3.1 HALO Hardware Abstraction & Explicit Fences',
        content: `JARVISOS replaces legacy display servers (X11, Wayland, SurfaceFlinger) with HALO (Hardware Accelerated Lightweight Operator). Built for Unified Memory Architectures (UMA) on ARM SoCs, hal_buffer_t buffers reside in shared DMA memory accessible directly by the GPU, Display Processing Unit (DPU), and Camera ISP via SMMUv3 page mappings.

Explicit hardware sync fences coordinate render timelines between CPU, GPU, and DPU without kernel lock contention.`,
      },
      {
        id: 'p3_prism',
        heading: '3.2 Prism Compositor & 120Hz Frame Budget (8.33ms)',
        content: `Prism offloads opaque and transformed surfaces directly to hardware DPU overlay planes, completely bypassing GPU power consumption for standard application scrolling and video playback.

The 120Hz frame timeline guarantees smooth 8.33ms execution:
- 0.0 - 1.2ms: Touch hardware IRQ and gesture calculation
- 1.2 - 3.8ms: App UI layout, constraint solving, and vector command building
- 3.8 - 6.0ms: GPU fragment/compute execution
- 6.0 - 7.8ms: Prism compositor plane assignment and shader effects
- 7.8 - 8.33ms: DPU register commit before panel vertical blanking interval (VSYNC)`,
      },
      {
        id: 'p3_helios',
        heading: '3.3 Helios Spatial Interface & Holographic HUD',
        content: `Helios manages visual surfaces across three operational paradigms:
1. Spatial HUD Mode: The signature JARVIS experience with floating glass panels, depth projection, and reactive audio reactors.
2. Desktop Continuum Mode: Multi-window workspace activated when docking or connecting to external displays over USB-C.
3. Handheld Mobile Mode: Focused single-app and split-screen touch navigation.`,
      },
    ],
  },
  {
    partNumber: 4,
    totalParts: 12,
    title: 'Part 4 of 12: Application Framework, Native SDK (CoreJarvis), & Sanctuary Sandbox',
    subtitle: '.japp Zero-Copy Packaging, ARMv9 MTE Tagging, Stasis Memory Compactor, & Nexus RPC Protocol',
    sections: [
      {
        id: 'p4_japp',
        heading: '4.1 The .japp Container & Zero-Decompression Mapping',
        content: `Applications in JARVISOS compile ahead-of-time (AOT) to native ARM64 machine code. The .japp container is an immutable, 64KB page-aligned archive that maps directly into process virtual memory without extraction.

Security is guaranteed through per-block SHA3-512 Merkle trees verified against developer certificates and VaultOS root keys.`,
      },
      {
        id: 'p4_sanctuary',
        heading: '4.2 Sanctuary Sandbox & Hardware Memory Tagging (MTE)',
        content: `Each process runs in a private CSpace with zero ambient privileges. Synchronous hardware Memory Tagging Extensions (ARMv9 MTE) check 4-bit memory tags on every 16-byte load and store operation, preventing use-after-free and buffer overflow exploits with zero runtime CPU overhead.`,
      },
      {
        id: 'p4_stasis',
        heading: '4.3 Stasis Lifecycle Engine & Eviction Scoring',
        content: `When physical memory reaches capacity, the Stasis Engine evaluates an eviction index:

S = (M_resident * (1 - P_resume)) / (T_cold_start * W_priority)

The process with the highest eviction score has its address space compressed via hardware ZSTD and flushed to NovaFS flash, reclaiming RAM instantaneously.`,
      },
    ],
  },
  {
    partNumber: 5,
    totalParts: 12,
    title: 'Part 5 of 12: Native AI Architecture: Synapse Engine & Mnemosyne Episodic Memory',
    subtitle: '45 TOPS Heterogeneous NPU Pipeline, Aegis-Core 3.2B SLM, Speculative Decoding, and Vector Graph Memory',
    sections: [
      {
        id: 'p5_synapse',
        heading: '5.1 Synapse Heterogeneous Compute Broker',
        content: `Synapse (system/synapsed) manages AI workloads as a fundamental OS primitive, scheduling tensor execution graphs across the NPU (45 TOPS INT4/INT8), ARMv9 Scalable Matrix Extension (SME2), and GPU Compute.

Model weights stream from NovaFS flash using 64KB demand-paged extents, ensuring multi-billion parameter models execute without exhausting system RAM.`,
      },
      {
        id: 'p5_models',
        heading: '5.2 Multimodal On-Device Model Hierarchy',
        content: `The on-device intelligence stack operates in tiered power domains:
1. Micro-Wake Engine: 128KB acoustic CNN running on audio DSP (<5mW).
2. Acoustic Conformer STT: Sub-120ms streaming speech-to-text.
3. Screen Grounding VLM: 500M parameter vision transformer analyzing active UI.
4. Aegis-Core SLM: 3.2B parameter dense transformer (INT4-AWQ, 1.62GB memory footprint).
5. Neural Vocoder TTS: Streaming flow-matching synthesizer (<80ms audio latency).
6. Private Cloud Compute (PCC): Hardware-attested TLS 1.3 escalation for complex reasoning tasks.`,
      },
      {
        id: 'p5_mnemosyne',
        heading: '5.3 Mnemosyne Real-Time Episodic Memory Engine',
        content: `Mnemosyne indexes screen text, system actions, and user interactions into an on-device Hierarchical Navigable Small World (HNSW) vector database. All embeddings are encrypted at rest with keys derived from VaultOS, enabling natural queries like "Find the invoice number from the document I looked at yesterday".`,
      },
    ],
  },
  {
    partNumber: 6,
    totalParts: 12,
    title: 'Part 6 of 12: Security Architecture, VaultOS Enclave, & Zero-Trust Capabilities',
    subtitle: 'Post-Quantum Dilithium-3 Root, Hardware eFuses, Transient Capabilities, and Biometric Keystores',
    sections: [
      {
        id: 'p6_vault',
        heading: '6.1 VaultOS Hardware Secure Enclave (S-EL1)',
        content: `VaultOS executes within isolated secure memory physically segregated from the main OS by the System Memory Management Unit (SMMU). It holds exclusive control over the SoC True Random Number Generator (TRNG), Physically Unclonable Function (PUF), and monotonic anti-rollback eFuses.`,
      },
      {
        id: 'p6_transient',
        heading: '6.2 Transient Capabilities & Privacy Interlocks',
        content: `Permissions are never permanent. When an application requests camera or microphone access, the system broker issues a Transient Capability Token cryptographically signed by VaultOS. The token automatically expires when user focus shifts, and hardware GPIO interlocks verify physical privacy LED illumination.`,
      },
    ],
  },
  {
    partNumber: 7,
    totalParts: 12,
    title: 'Part 7 of 12: High-Performance Network Stack & Zero-Copy Protocols',
    subtitle: 'netd Userspace Architecture, Native QUIC / TLS 1.3, Cellular Baseband RIL, & Wi-Fi 7 Sandboxing',
    sections: [
      {
        id: 'p7_netd',
        heading: '7.1 Zero-Copy Userspace Network Stack (netd)',
        content: `netd communicates with network interface hardware through shared-memory circular ring buffers. Packet headers and payloads traverse from physical Wi-Fi/Cellular DMA buffers directly into application address spaces without intermediate copying.`,
      },
      {
        id: 'p7_ril',
        heading: '7.2 5G NR Baseband Isolation & PCIe Shm Interface',
        content: `The cellular modem executes in an isolated EL2 virtualization enclave. The Radio Interface Layer (RIL) exchanges commands across PCIe shared memory using lockless ring descriptors, shielding the main operating system from proprietary baseband vulnerabilities.`,
      },
    ],
  },
  {
    partNumber: 8,
    totalParts: 12,
    title: 'Part 8 of 12: Input, Sensors, Audio DSP Subsystem, & Low-Latency Haptics',
    subtitle: 'audiod 2.5ms Processing Budget, DSP Offloading, Capacitive Multi-Touch Pipeline, & IMU Sensor Fusion',
    sections: [
      {
        id: 'p8_audio',
        heading: '8.1 Ultra-Low-Latency Audio Subsystem (audiod)',
        content: `audiod operates on strict 2.5-millisecond buffer windows pinned to the CLASS_AUDIO_PROCESSING real-time scheduling queue. When the device is idle, keyword detection and audio decoding offload to the SoC ultra-low-power DSP, allowing main CPU clusters to stay in deep C-states.`,
      },
      {
        id: 'p8_input',
        heading: '8.2 Multi-Touch & Inverse Matrix Spatial Hit-Testing',
        content: `The capacitive touch driver reports raw contact ellipses at 240Hz. Helios calculates touch coordinates using inverse 4x4 matrix projections, guaranteeing accurate touch detection even during active 3D window rotations and spring animations.`,
      },
    ],
  },
  {
    partNumber: 9,
    totalParts: 12,
    title: 'Part 9 of 12: Power Management, Thermal Governance (PID), & Standby Models',
    subtitle: 'Multi-Input PID Thermal Mitigator, Asymmetric DVFS Governor, & Micro-Watt Sleep Standby',
    sections: [
      {
        id: 'p9_thermal',
        heading: '9.1 Proportional-Integral-Derivative Thermal Control',
        content: `A software PID governor samples temperatures across CPU, GPU, skin, and battery sensors every 50ms. Dynamic Voltage and Frequency Scaling (DVFS) states adjust dynamically:

P_out = Kp * e(t) + Ki * ∫ e(t) dt + Kd * (de/dt)

This prevents sudden thermal throttling and preserves sustained performance during continuous AI inference passes.`,
      },
      {
        id: 'p9_power',
        heading: '9.2 Heterogeneous Energy Profiles & Sleep States',
        content: `In standby, JARVISOS draws under 12 milliwatts by powering down all high-frequency clock domains and delegating wake-word monitoring to the audio DSP and VaultOS sensor hubs.`,
      },
    ],
  },
  {
    partNumber: 10,
    totalParts: 12,
    title: 'Part 10 of 12: App Ecosystem, Compiler Toolchain (J-Clang), & Package Repository',
    subtitle: 'Hermetic LLVM/Clang Toolchain, Nexus IDL Compiler (nidlc), Digital Signatures, & App Store Topology',
    sections: [
      {
        id: 'p10_compiler',
        heading: '10.1 Hermetic Toolchain & J-Clang Compiler',
        content: `Applications compile through J-Clang, a customized LLVM toolchain that automatically injects ARMv9 MTE stack instrumentation, bounds checks, and capability token lookups at compile time.`,
      },
      {
        id: 'p10_nidl',
        heading: '10.2 Nexus Interface Definition Language Compiler',
        content: `The nidlc compiler transforms declarative service schemas (.nidl) into type-safe, zero-copy C++ and Rust bindings, ensuring all inter-process IPC is verified at compile time.`,
      },
    ],
  },
  {
    partNumber: 11,
    totalParts: 12,
    title: 'Part 11 of 12: Production Deployment Roadmap, Multi-Billion Budget, & Org Topology',
    subtitle: 'Milestones v0.1 to v10.0, Silicon Validation Timelines, $2.4B Capital Allocation, & Engineering Division',
    sections: [
      {
        id: 'p11_roadmap',
        heading: '11.1 Release Lifecycle: Milestones 0.1 through 10.0',
        content: `Comprehensive development roadmap:
- v0.1 (Month 6): Aegis microkernel bringup on FPGA emulator (QEMU ARMv9).
- v0.5 (Month 14): NovaFS flash drivers, Prism compositor, and basic CLI userspace.
- v1.0 (Month 24): Commercial smartphone release, Synapse on-device SLM, VaultOS attestation.
- v3.0 (Month 48): Spatial Continuum, multi-device neural sync, post-quantum production rollout.
- v10.0 (Decade 1): Autonomous self-optimizing kernel, neuromorphic compute integration.`,
        table: {
          headers: ['Version', 'Timeline', 'Primary Deliverable', 'Target Silicon'],
          rows: [
            ['v0.1', 'Month 1-6', 'Aegis EL1 Kernel Core & Bootloader', 'QEMU ARMv9.2 / FPGA'],
            ['v0.5', 'Month 7-14', 'NovaFS, Prism DPU Compositor, UDM Drivers', 'Qualcomm / MediaTek Reference'],
            ['v1.0', 'Month 15-24', 'Commercial Launch, Synapse NPU, VaultOS', 'Custom Flagship Silicon'],
            ['v3.0', 'Month 36-48', 'Desktop Continuum, Multi-Agent Mesh', 'Next-Gen 3nm Mobile SoC'],
          ],
        },
      },
      {
        id: 'p11_budget',
        heading: '11.2 Engineering Team Topology & $2.4B Budget Allocation',
        content: `Organizational allocation of 650 world-class systems engineers:
- Kernel & Low-Level Architecture: 120 Engineers ($480M)
- Graphics, Compositor & UI: 85 Engineers ($320M)
- Neural Runtime & AI Architecture: 140 Engineers ($580M)
- Security, Cryptography & VaultOS: 75 Engineers ($290M)
- Hardware Drivers & Silicon Bringup: 110 Engineers ($420M)
- Toolchain, SDK & Developer Ecosystem: 70 Engineers ($210M)
- Silicon Mask & Hardware Prototyping: $100M Capital Reserve`,
      },
    ],
  },
  {
    partNumber: 12,
    totalParts: 12,
    title: 'Part 12 of 12: Bootable ISO Generator & Lenovo E41-25 Low-Spec Hardware Deployment',
    subtitle: 'Target: AMD A6-9225 APU / 4GB RAM / 256GB SSD, 100% Offline AI Execution, zRAM & Cage Kiosk',
    sections: [
      {
        id: 'p12_budget_analysis',
        heading: '12.1 Dedicated 4 GB RAM System Budget for Lenovo E41-25',
        content: `Your Lenovo E41-25 laptop (AMD A6-9225 dual-core APU, Radeon R4 Graphics, 4GB RAM, 256GB SSD) can run a fully local, offline JARVIS operating system by implementing our ultra-lightweight SLM stack:

Memory Allocation Breakdown (Under 1.5 GB Total):
- Minimal OS Kernel & Cage Wayland Kiosk: 185 MB
- Vosk Real-Time Acoustic STT: 95 MB
- Piper Neural Voice Synthesis: 48 MB
- Qwen-2.5-1.5B (Quantized Q4_K_M via llama.cpp): 1,040 MB
- HUD Interface & Orchestrator: 112 MB
- Total Physical RAM Used: 1,480 MB (~1.48 GB)
- Free RAM Safety Buffer: 2,616 MB (~2.6 GB Headroom!)

With zRAM configured (ZSTD compressed in-memory swap at 50% physical RAM), your 4 GB RAM behaves with over 6 GB of effective multitasking capacity with zero SSD wear.`,
      },
      {
        id: 'p12_recipe',
        heading: '12.2 Debian Live-Build / Archiso Production Recipe',
        content: `The automated build script creates a bootable hybrid UEFI/BIOS ISO image that installs directly to your 256GB SSD or runs as a live USB.

Key System Configurations:
1. Base: Debian 12 (Bookworm) Minimal or Alpine Linux.
2. Window Compositor: Cage (single-app Wayland kiosk, 30MB RAM footprint).
3. Audio Stack: PipeWire + WirePlumber low-latency routing.
4. AI Backend: llama.cpp compiled with AVX2/FMA optimizations for the AMD APU.
5. Storage Optimization: SSD partition aligned to 4KB sectors with elevator=none.`,
        codeSnippet: {
          language: 'bash',
          code: `# Quick Start on your Linux or Live USB:
# 1. Download the build script from JARVISOS Studio
chmod +x build-jarvisos-iso.sh

# 2. Build the bootable ISO
sudo ./build-jarvisos-iso.sh

# 3. Flash to USB Drive (replace /dev/sdX with your USB drive)
sudo dd if=dist-iso/jarvisos-lenovo-e41-25.iso of=/dev/sdX bs=4M status=progress oflag=sync`,
        },
      },
    ],
  },
];
