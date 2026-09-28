import React, { useEffect, useState } from 'react';
import { AlertTriangle, BellRing, Check, CircleAlert, ExternalLink, LoaderCircle, Mail, MessageSquare, Radio, ShieldCheck } from 'lucide-react';
import type { EarlyWarningAlert } from '../types';
import { getAlertDeliveryStatus, deliverAlert, DeliveryChannel } from '../services/backend';
import { RISK_PALETTE } from '../utils/riskEngine';

interface AlertsWorkspaceProps {
  alerts: EarlyWarningAlert[];
  simulationAlerts: EarlyWarningAlert[];
  onOpenSimulation: () => void;
}

type DeliveryState = 'checking' | 'ready' | 'unconfigured' | 'unavailable';
const CHANNEL_LABELS: Record<DeliveryChannel, string> = {
  webhook: 'Webhook',
  email: 'Email',
  sms: 'SMS (Twilio)',
};

export const AlertsWorkspace: React.FC<AlertsWorkspaceProps> = ({ alerts, simulationAlerts, onOpenSimulation }) => {
  const [deliveryState, setDeliveryState] = useState<DeliveryState>('checking');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [deliveryResults, setDeliveryResults] = useState<Record<string, string>>({});
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [channelStatus, setChannelStatus] = useState<Record<DeliveryChannel, boolean> | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<DeliveryChannel | ''>('');

  useEffect(() => {
    let active = true;
    getAlertDeliveryStatus()
      .then((status) => {
        if (!active) return;
        setChannelStatus(status.channels);
        setDeliveryState(status.configured ? 'ready' : 'unconfigured');
        const firstConfigured = (Object.keys(CHANNEL_LABELS) as DeliveryChannel[]).find((channel) => status.channels[channel]);
        setSelectedChannel((current) => current && status.channels[current] ? current : firstConfigured || '');
      })
      .catch(() => active && setDeliveryState('unavailable'));
    return () => { active = false; };
  }, []);

  const handleDeliver = async (alert: EarlyWarningAlert) => {
    if (!selectedChannel) return;
    setSendingId(alert.id);
    setDeliveryResults((previous) => ({ ...previous, [alert.id]: '' }));
    try {
      await deliverAlert(alert, selectedChannel);
      setDeliveryResults((previous) => ({ ...previous, [alert.id]: `Delivered using ${CHANNEL_LABELS[selectedChannel]}.` }));
    } catch (error) {
      setDeliveryResults((previous) => ({
        ...previous,
        [alert.id]: error instanceof Error ? error.message : 'Delivery failed.',
      }));
    } finally {
      setSendingId(null);
    }
  };

  const handleTestDelivery = async () => {
    if (!selectedChannel) return;
    setTestSending(true);
    setTestResult(null);
    try {
      await deliverAlert({
        id: `delivery-test-${Date.now()}`,
        zoneId: 'delivery-test',
        zoneName: 'Delivery Test',
        region: 'JALRAKSHAK',
        level: 'High',
        hazardType: 'EXTREME_RAINFALL',
        headline: 'Test notification from JALRAKSHAK',
        recommendation: 'This is a test message. No action is required.',
        timestamp: new Date().toLocaleTimeString(),
        compositeScore: 60,
      }, selectedChannel);
      setTestResult(`Test message accepted using ${CHANNEL_LABELS[selectedChannel]}.`);
    } catch (error) {
      setTestResult(error instanceof Error ? error.message : 'Test delivery failed.');
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#f8faf8]">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-7">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-300 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-orange-700">Operations</p>
            <h1 className="mt-1 text-xl font-bold text-stone-950">Alert delivery</h1>
            <p className="mt-1 text-xs text-stone-600">Live high-severity advisories and outbound delivery status.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 border border-stone-300 bg-white px-3 py-2 text-[11px] font-semibold text-stone-700">
              {deliveryState === 'checking' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : deliveryState === 'ready' ? <ShieldCheck className="h-4 w-4 text-emerald-700" /> : <CircleAlert className="h-4 w-4 text-orange-700" />}
              {deliveryState === 'checking' ? 'Checking backend' : deliveryState === 'ready' ? `${Object.entries(channelStatus || {}).filter(([, ready]) => ready).map(([channel]) => CHANNEL_LABELS[channel as DeliveryChannel]).join(', ')} ready` : deliveryState === 'unconfigured' ? 'No delivery channel configured' : 'Backend unreachable'}
            </div>
            <label className="flex items-center gap-2 border border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-700">
              <span>Send via</span>
              <select
                aria-label="Alert delivery channel"
                value={selectedChannel}
                onChange={(event) => setSelectedChannel(event.target.value as DeliveryChannel | '')}
                disabled={deliveryState !== 'ready'}
                className="max-w-36 bg-transparent py-1 text-stone-900 outline-none"
              >
                <option value="" disabled>Select channel</option>
                {(Object.keys(CHANNEL_LABELS) as DeliveryChannel[]).filter((channel) => channelStatus?.[channel]).map((channel) => (
                  <option key={channel} value={channel}>{CHANNEL_LABELS[channel]}</option>
                ))}
              </select>
              {selectedChannel === 'email' ? <Mail className="h-3.5 w-3.5" /> : selectedChannel === 'sms' ? <MessageSquare className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
            </label>
            {deliveryState === 'ready' && (
              <button
                type="button"
                onClick={() => void handleTestDelivery()}
                disabled={!selectedChannel || testSending || sendingId !== null}
                className="flex items-center gap-2 border border-stone-700 bg-white px-3 py-2 text-[11px] font-bold text-stone-800 hover:bg-stone-100 disabled:opacity-50"
              >
                {testSending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
                Send test alert
              </button>
            )}
          </div>
        </header>

        {testResult && <p role="status" className="mt-3 text-[11px] text-stone-600">{testResult}</p>}

        <section className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-stone-900">
            <BellRing className="h-4 w-4 text-orange-700" />
            Current advisories <span className="font-mono text-stone-500">{alerts.length}</span>
          </div>
          {alerts.length === 0 ? (
            <div className="border border-stone-200 bg-white px-4 py-8 text-center text-xs text-stone-600">
              <Check className="mx-auto mb-2 h-6 w-6 text-emerald-700" />
              No live high or severe alerts are active.
            </div>
          ) : (
            <div className="divide-y divide-stone-200 border-y border-stone-200 bg-white">
              {alerts.map((alert) => {
                const palette = RISK_PALETTE[alert.level];
                return (
                  <article key={alert.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`border px-2 py-1 text-[10px] font-bold uppercase ${palette.badgeBg} ${palette.badgeText} ${palette.badgeBorder}`}>{alert.level}</span>
                        <h2 className="text-sm font-bold text-stone-950">{alert.zoneName}</h2>
                        <span className="text-[11px] text-stone-500">{alert.region} · {alert.timestamp}</span>
                      </div>
                      <p className="mt-2 text-xs font-semibold text-stone-800">{alert.headline}</p>
                      <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-stone-600">{alert.recommendation}</p>
                    </div>
                    <div className="shrink-0 sm:w-48">
                      <button
                        type="button"
                        onClick={() => void handleDeliver(alert)}
                        disabled={deliveryState !== 'ready' || !selectedChannel || sendingId !== null}
                        className="flex w-full items-center justify-center gap-2 border border-stone-900 bg-stone-900 px-3 py-2 text-xs font-bold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {sendingId === alert.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
                        Deliver via {selectedChannel ? CHANNEL_LABELS[selectedChannel] : 'channel'}
                      </button>
                      {deliveryResults[alert.id] && <p role="status" className="mt-2 text-[10px] leading-relaxed text-stone-600">{deliveryResults[alert.id]}</p>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-7 border-t border-stone-300 pt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-stone-900">
              <AlertTriangle className="h-4 w-4 text-sky-700" />
              Simulation preview <span className="font-mono text-stone-500">{simulationAlerts.length}</span>
            </div>
            <button type="button" onClick={onOpenSimulation} className="flex items-center gap-1 text-[11px] font-bold text-sky-800 hover:text-sky-950">
              Open simulation <ExternalLink className="h-3 w-3" />
            </button>
          </div>
          {simulationAlerts.length === 0 ? (
            <p className="border border-stone-200 bg-white px-4 py-4 text-[11px] text-stone-600">Current sandbox inputs do not produce a high or severe preview alert.</p>
          ) : (
            <div className="divide-y divide-stone-200 border-y border-stone-200 bg-white">
              {simulationAlerts.map((alert) => (
                <article key={alert.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="border border-sky-300 bg-sky-50 px-2 py-1 text-[10px] font-bold uppercase text-sky-900">Simulation only</span>
                    <span className="text-xs font-bold text-stone-900">{alert.zoneName}</span>
                    <span className="text-[10px] font-bold text-orange-800">{alert.level} · {alert.compositeScore}/100</span>
                  </div>
                  <p className="mt-2 text-[11px] text-stone-700">{alert.headline}</p>
                  <p className="mt-1 text-[10px] text-stone-500">Simulation previews are never sent through any delivery channel.</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
