import React from 'react';
import {
  Mic,
  Terminal,
  HardDrive,
  Cpu,
  Brain,
  Crosshair,
  Shield,
  Laptop,
  BookOpen,
  Globe,
  Play,
  Wifi,
  EyeOff,
  Settings,
  Bell,
} from 'lucide-react';
import { sound } from '../utils/audio-fx';
import { AppId, WindowState } from '../types/os';

interface DockProps {
  activeAppId: string | null;
  openAppIds: string[];
  portalWindows?: WindowState[];
  onOpenApp: (id: AppId) => void;
  onFocusWindow?: (id: string) => void;
}

interface DockItem {
  id: AppId;
  label: string;
  icon: React.ReactNode;
}

export const Dock: React.FC<DockProps> = ({
  activeAppId,
  openAppIds,
  portalWindows = [],
  onOpenApp,
  onFocusWindow,
}) => {
  const dockItems: DockItem[] = [
    { id: 'voice_reactor', label: 'Jarvis Arc Core', icon: <Mic className="w-5 h-5 text-cyan-400" /> },
    { id: 'browser', label: 'JARVIS Browser', icon: <Globe className="w-5 h-5 text-cyan-300" /> },
    { id: 'terminal', label: 'Aegis Terminal', icon: <Terminal className="w-5 h-5 text-emerald-400" /> },
    { id: 'novafs', label: 'NovaFS Storage', icon: <HardDrive className="w-5 h-5 text-blue-400" /> },
    { id: 'kernel_monitor', label: 'EAS Kernel Scheduler', icon: <Cpu className="w-5 h-5 text-amber-400" /> },
    { id: 'synapse_neural', label: 'Synapse Neural (45 TOPS)', icon: <Brain className="w-5 h-5 text-purple-400" /> },
    { id: 'vision_hud', label: 'Vision & Spatial HUD', icon: <Crosshair className="w-5 h-5 text-red-400" /> },
    { id: 'vault_security', label: 'VaultOS Enclave', icon: <Shield className="w-5 h-5 text-emerald-400" /> },
    { id: 'iso_builder', label: 'Lenovo E41-25 ISO Builder', icon: <Laptop className="w-5 h-5 text-cyan-300" /> },
    { id: 'specs_reader', label: '12-Part Master Specs', icon: <BookOpen className="w-5 h-5 text-yellow-300" /> },
  ];

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 select-none max-w-[96vw] overflow-x-auto">
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl glass-panel shadow-[0_0_25px_rgba(0,0,0,0.8)] border border-cyan-500/30">
        {dockItems.map(item => {
          const isOpen = openAppIds.includes(item.id);
          const isActive = activeAppId === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                sound.playBlip();
                onOpenApp(item.id);
              }}
              title={item.label}
              aria-label={item.label}
              className={`relative p-2.5 rounded-xl transition-all duration-200 flex flex-col items-center justify-center hover:scale-110 active:scale-95 group focus:outline-none shrink-0 ${
                isActive
                  ? 'bg-cyan-500/30 shadow-[0_0_15px_rgba(0,229,255,0.4)] border border-cyan-400/50'
                  : 'hover:bg-slate-800/80'
              }`}
            >
              {item.icon}

              {isOpen && (
                <span className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,229,255,0.8)]" />
              )}

              <span className="absolute -top-8 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-cyan-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
                {item.label}
              </span>
            </button>
          );
        })}

        {portalWindows.length > 0 && (
          <>
            <div className="w-px h-6 bg-cyan-500/25 mx-1 shrink-0" />
            {portalWindows.map(win => {
              const isOpen = !win.minimized;
              const isActive = activeAppId === win.id;
              const isYouTube = win.portal?.mode === 'youtube';
              const isNetwork = win.id === 'network_settings';
              const isPrivateBrowser = win.id === 'browser_private';
              const isSystemSettings = win.id === 'system_settings';
              const isNotificationCenter = win.id === 'notification_center';

              return (
                <button
                  key={win.id}
                  onClick={() => {
                    sound.playBlip();
                    onFocusWindow?.(win.id);
                  }}
                  title={win.title}
                  aria-label={win.title}
                  className={`relative p-2.5 rounded-xl transition-all duration-200 flex flex-col items-center justify-center hover:scale-110 active:scale-95 group focus:outline-none shrink-0 ${
                    isActive
                      ? 'bg-cyan-500/30 shadow-[0_0_15px_rgba(0,229,255,0.4)] border border-cyan-400/50'
                      : 'hover:bg-slate-800/80'
                  }`}
                >
                  {isPrivateBrowser ? (
                    <EyeOff className="w-5 h-5 text-violet-400" />
                  ) : isNetwork ? (
                    <Wifi className="w-5 h-5 text-cyan-400" />
                  ) : isSystemSettings ? (
                    <Settings className="w-5 h-5 text-cyan-300" />
                  ) : isNotificationCenter ? (
                    <Bell className="w-5 h-5 text-cyan-400" />
                  ) : isYouTube ? (
                    <Play className="w-5 h-5 text-red-400" />
                  ) : (
                    <Globe className="w-5 h-5 text-cyan-300" />
                  )}

                  {isOpen && (
                    <span className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,229,255,0.8)]" />
                  )}

                  <span className="absolute -top-8 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-cyan-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg max-w-[200px] truncate">
                    {win.title}
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
