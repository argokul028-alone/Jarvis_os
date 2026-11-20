import React, { useRef } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { sound } from '../utils/audio-fx';
import {
  WindowState,
  AppId,
  SystemTelemetry,
  AppShortcut,
  WebPortalPayload,
  WifiState,
  SystemSettingsSection,
} from '../types/os';
import { JarvisVoiceReactor } from './JarvisVoiceReactor';
import { TerminalApp } from './TerminalApp';
import { NovaFsApp } from './NovaFsApp';
import { KernelMonitorApp } from './KernelMonitorApp';
import { SynapseNeuralApp } from './SynapseNeuralApp';
import { VisionGroundingApp } from './VisionGroundingApp';
import { VaultSecurityApp } from './VaultSecurityApp';
import { IsoBuilderApp } from './IsoBuilderApp';
import { SpecsExplorerApp } from './SpecsExplorerApp';
import { WebPortalApp } from './WebPortalApp';
import { NetworkSettingsApp } from './NetworkSettingsApp';
import { JarvisBrowserApp } from './JarvisBrowserApp';
import { SystemSettingsApp } from './SystemSettingsApp';
import {
  NotificationManagerContent,
  NotificationManagerSharedProps,
} from './NotificationManagerPanel';
import { ErrorBoundary } from './ErrorBoundary';

interface HeliosWindowManagerProps {
  windows: WindowState[];
  activeWindowId: string | null;
  telemetry: SystemTelemetry;
  customApps: AppShortcut[];
  wifiState: WifiState;
  onToggleWifi: () => void | Promise<void>;
  onConnectWifi: (ssidOrId: string, passphrase?: string, hidden?: boolean) => Promise<string | null>;
  onDisconnectWifi: () => void | Promise<void>;
  onForgetWifi: (ssidOrId: string) => void | Promise<void>;
  onToggleAutoReconnect: () => void;
  onScanWifi: () => void | Promise<void>;
  onAddCustomApp: (shortcut: AppShortcut) => void;
  onRemoveCustomApp: (idOrName: string) => boolean;
  onFocusWindow: (id: string) => void;
  onCloseWindow: (id: string) => void;
  onMinimizeWindow: (id: string) => void;
  onMaximizeWindow: (id: string) => void;
  onMoveWindow: (id: string, x: number, y: number) => void;
  onUpdateWindowTitle: (id: string, title: string) => void;
  onOpenApp: (id: AppId) => void;
  onOpenWebPortal: (payload: WebPortalPayload) => void;
  activeSettingsSection: SystemSettingsSection;
  onSelectSettingsSection: (section: SystemSettingsSection) => void;
  onSendTestNotification: () => void;
  onRemoveBluetoothDevice: (deviceId: string) => void;
  notificationManagerProps: NotificationManagerSharedProps;
}

export const HeliosWindowManager: React.FC<HeliosWindowManagerProps> = ({
  windows,
  activeWindowId,
  telemetry,
  customApps,
  wifiState,
  onToggleWifi,
  onConnectWifi,
  onDisconnectWifi,
  onForgetWifi,
  onToggleAutoReconnect,
  onScanWifi,
  onAddCustomApp,
  onRemoveCustomApp,
  onFocusWindow,
  onCloseWindow,
  onMinimizeWindow,
  onMaximizeWindow,
  onMoveWindow,
  onUpdateWindowTitle,
  onOpenApp,
  onOpenWebPortal,
  activeSettingsSection,
  onSelectSettingsSection,
  onSendTestNotification,
  onRemoveBluetoothDevice,
  notificationManagerProps,
}) => {
  const draggingRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const handleMouseDownHeader = (e: React.MouseEvent, id: string, origX: number, origY: number) => {
    onFocusWindow(id);
    sound.playBlip();
    draggingRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX,
      origY,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!draggingRef.current) return;
      const dx = moveEvent.clientX - draggingRef.current.startX;
      const dy = moveEvent.clientY - draggingRef.current.startY;
      onMoveWindow(
        draggingRef.current.id,
        Math.max(10, draggingRef.current.origX + dx),
        Math.max(40, draggingRef.current.origY + dy)
      );
    };

    const handleMouseUp = () => {
      draggingRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const renderComponent = (win: WindowState) => {
    const appType = win.appType || (win.id as AppId);

    if (appType === 'web_portal' && win.portal) {
      return (
        <WebPortalApp
          portal={win.portal}
          onUpdateTitle={title => onUpdateWindowTitle(win.id, title)}
        />
      );
    }

    switch (appType) {
      case 'voice_reactor':
        return (
          <JarvisVoiceReactor
            telemetry={telemetry}
            customApps={customApps}
            onAddCustomApp={onAddCustomApp}
            onRemoveCustomApp={onRemoveCustomApp}
            onOpenWebPortal={onOpenWebPortal}
            onExecuteCommand={cmd => {
              if (cmd.startsWith('open:')) {
                onOpenApp(cmd.replace('open:', '') as AppId);
              }
            }}
          />
        );
      case 'terminal':
        return (
          <TerminalApp
            telemetry={telemetry}
            customApps={customApps}
            onAddCustomApp={onAddCustomApp}
            onRemoveCustomApp={onRemoveCustomApp}
            onOpenApp={onOpenApp}
            onOpenWebPortal={onOpenWebPortal}
          />
        );
      case 'novafs':
        return <NovaFsApp />;
      case 'kernel_monitor':
        return <KernelMonitorApp telemetry={telemetry} />;
      case 'synapse_neural':
        return <SynapseNeuralApp />;
      case 'vision_hud':
        return <VisionGroundingApp />;
      case 'vault_security':
        return <VaultSecurityApp />;
      case 'iso_builder':
        return <IsoBuilderApp />;
      case 'specs_reader':
        return <SpecsExplorerApp />;
      case 'network_settings':
        return (
          <NetworkSettingsApp
            wifiState={wifiState}
            onToggleWifi={onToggleWifi}
            onConnectNetwork={onConnectWifi}
            onDisconnectNetwork={onDisconnectWifi}
            onForgetNetwork={onForgetWifi}
            onToggleAutoReconnect={onToggleAutoReconnect}
            onScanNetworks={onScanWifi}
            onOpenIsoBuilder={() => onOpenApp('iso_builder')}
          />
        );
      case 'browser':
        return (
          <ErrorBoundary fallbackTitle="JARVIS Browser Recovery">
            <JarvisBrowserApp
              isPrivate={false}
              onOpenPrivateWindow={() => onOpenApp('browser_private')}
              onUpdateWindowTitle={title => onUpdateWindowTitle(win.id, title)}
            />
          </ErrorBoundary>
        );
      case 'browser_private':
        return (
          <ErrorBoundary fallbackTitle="JARVIS Private Browser Recovery">
            <JarvisBrowserApp
              isPrivate={true}
              onOpenPrivateWindow={() => onOpenApp('browser_private')}
              onUpdateWindowTitle={title => onUpdateWindowTitle(win.id, title)}
            />
          </ErrorBoundary>
        );
      case 'system_settings':
        return (
          <SystemSettingsApp
            activeSection={activeSettingsSection}
            onSelectSection={onSelectSettingsSection}
            notificationSettings={notificationManagerProps.settings}
            quickControls={notificationManagerProps.quickControls}
            wifiState={wifiState}
            powerState={notificationManagerProps.powerState}
            screenshotCountdown={notificationManagerProps.screenshotCountdown}
            onUpdateNotificationSettings={notificationManagerProps.onUpdateSettings}
            onSendTestNotification={onSendTestNotification}
            onToggleLocation={notificationManagerProps.onToggleLocation}
            onToggleLocationHighAccuracy={notificationManagerProps.onToggleLocationHighAccuracy}
            onRefreshLocation={notificationManagerProps.onRefreshLocation}
            onSelectPowerMode={notificationManagerProps.onSelectPowerMode}
            onToggleChargeLimit80={notificationManagerProps.onToggleChargeLimit80}
            onToggleBluetooth={notificationManagerProps.onToggleBluetooth}
            onToggleBluetoothDiscoverable={notificationManagerProps.onToggleBluetoothDiscoverable}
            onScanBluetooth={notificationManagerProps.onScanBluetooth}
            onToggleBluetoothDevice={notificationManagerProps.onToggleBluetoothDevice}
            onRemoveBluetoothDevice={onRemoveBluetoothDevice}
            onUpdateHotspot={notificationManagerProps.onUpdateHotspot}
            onToggleFlightMode={notificationManagerProps.onToggleFlightMode}
            onUpdateNearbySharing={notificationManagerProps.onUpdateNearbySharing}
            onOpenNetworkSettings={() => onOpenApp('network_settings')}
            onScanWifi={onScanWifi}
            onCaptureScreenshot={notificationManagerProps.onCaptureScreenshot}
            onUpdateScreenshotPrefs={notificationManagerProps.onUpdateScreenshotPrefs}
            onUpdateVpnProxy={notificationManagerProps.onUpdateVpnProxy}
          />
        );
      case 'notification_center':
        return <NotificationManagerContent mode="window" {...notificationManagerProps} />;
      default:
        return null;
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {windows.map(win => {
        if (win.minimized) return null;
        const isActive = activeWindowId === win.id;

        return (
          <div
            key={win.id}
            style={{
              position: 'absolute',
              left: win.maximized ? 0 : `${win.x}px`,
              top: win.maximized ? 38 : `${win.y}px`,
              width: win.maximized ? '100%' : `${win.width}px`,
              height: win.maximized ? 'calc(100% - 38px - 64px)' : `${win.height}px`,
              zIndex: win.zIndex,
            }}
            onMouseDown={() => onFocusWindow(win.id)}
            className={`pointer-events-auto rounded-xl overflow-hidden flex flex-col shadow-2xl transition-shadow duration-200 glass-panel ${
              isActive
                ? 'border-cyan-400/60 shadow-[0_0_30px_rgba(0,229,255,0.2)] ring-1 ring-cyan-400/40'
                : 'border-slate-800 opacity-95'
            }`}
          >
            {/* Window Title Bar */}
            <div
              onMouseDown={e => {
                if (!win.maximized) {
                  handleMouseDownHeader(e, win.id, win.x, win.y);
                }
              }}
              className={`flex items-center justify-between px-3 py-2 border-b select-none cursor-move transition-colors ${
                win.id === 'browser_private'
                  ? isActive
                    ? 'bg-[#161029] border-violet-500/40 text-violet-200'
                    : 'bg-[#0e0a1c] border-violet-900/50 text-violet-400/80'
                  : isActive
                  ? 'bg-slate-900/90 border-cyan-500/30 text-cyan-300'
                  : 'bg-slate-950/90 border-slate-800 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2 font-mono text-xs font-bold truncate">
                <span className="text-sm">{win.icon}</span>
                <span className="truncate">{win.title}</span>
              </div>

              {/* Window Controls */}
              <div className="flex items-center gap-1.5 shrink-0" onMouseDown={e => e.stopPropagation()}>
                <button
                  onClick={() => onMinimizeWindow(win.id)}
                  aria-label={`Minimize ${win.title}`}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onMaximizeWindow(win.id)}
                  aria-label={`Maximize ${win.title}`}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                >
                  <Square className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onCloseWindow(win.id)}
                  aria-label={`Close ${win.title}`}
                  className="p-1 hover:bg-red-500/30 rounded text-slate-400 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Window Content */}
            <div className="flex-1 overflow-hidden relative bg-slate-950/80">
              {renderComponent(win)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
