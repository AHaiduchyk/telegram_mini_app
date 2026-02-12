import { ArrowLeft, Camera, ScanLine } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ScanQRScreenProps {
  onBack: () => void;
}

type ScanStatus = 'idle' | 'scanning' | 'saving' | 'success' | 'error';

type ScanResult = {
  rawText: string;
  checkId?: string;
  amount?: string;
  url?: string;
  merchant?: string;
  date?: string;
};

export function ScanQRScreen({ onBack }: ScanQRScreenProps) {
  const tgRef = useRef<any>(null);
  const lastScanRef = useRef<{ text: string; at: number } | null>(null);
  const autoStartRef = useRef(false);
  const scanResultRef = useRef<ScanResult | null>(null);
  const scanStatusRef = useRef<ScanStatus>('idle');
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanEnabled, setScanEnabled] = useState(true);
  const [savingExpense, setSavingExpense] = useState(false);
  const [showDuplicatePrompt, setShowDuplicatePrompt] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [isPremium, setIsPremium] = useState(false);

  const apiBase = import.meta.env?.VITE_API_BASE?.replace(/\/$/, '') ?? '';

  const showPremiumOnly = useCallback(() => {
    const tg = tgRef.current;
    if (tg?.showPopup) {
      tg.showPopup({
        title: 'Premium',
        message: 'This feature is available for premium users only.',
        buttons: [{ id: 'ok', type: 'ok', text: 'OK' }],
      });
      return;
    }
    window.alert('This feature is available for premium users only.');
  }, []);

  const logClient = useCallback(
    async (event: string, data?: Record<string, unknown>) => {
      try {
        const tg = tgRef.current;
        await fetch(`${apiBase}/api/client_log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event,
            data,
            user_agent: navigator.userAgent,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            init_data: tg?.initData ?? null,
            init_data_unsafe: tg?.initDataUnsafe ?? null,
          }),
        });
      } catch {
        // Ignore logging failures.
      }
    },
    [apiBase],
  );

  const submitScan = useCallback(
    async (rawText: string) => {
      const tg = tgRef.current;
      await logClient('scan_submit_request', { raw_text_len: rawText.length });
      const payload = {
        raw_text: rawText,
        init_data: tg?.initData ?? null,
        init_data_unsafe: tg?.initDataUnsafe ?? null,
      };

      const res = await fetch(`${apiBase}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        await logClient('scan_submit_failed', { status: res.status });
        throw new Error('Failed to store scan.');
      }

      return res.json();
    },
    [apiBase, logClient],
  );

  const handleQrText = useCallback(
    async (rawText: string) => {
      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.text === rawText && now - last.at < 2000) {
        return;
      }
      lastScanRef.current = { text: rawText, at: now };

      setScanStatus('saving');
      setError(null);

      try {
        await logClient('scan_submit_start', { raw_text_len: rawText.length });
        const scan = await submitScan(rawText);
        const info = scan?.info || {};
        const amountRaw = info?.sm ?? info?.amount ?? null;
        const amountText = amountRaw ? String(amountRaw).replace(',', '.') : undefined;
        setScanResult({
          rawText,
          checkId: info.check_id || info.id,
          amount: amountText,
          url: info.url,
          merchant: info.merchant,
          date: info.date,
        });
        setScanStatus('success');
        await logClient('scan_submit_success', {
          check_id: info.check_id || info.id || null,
          has_amount: Boolean(amountText),
        });
      } catch (err) {
        await logClient('scan_submit_error', {
          message: err instanceof Error ? err.message : 'Failed to store scan.',
        });
        setError(err instanceof Error ? err.message : 'Failed to store scan.');
        setScanStatus('error');
      } finally {
        tgRef.current?.closeScanQrPopup?.();
      }
    },
    [submitScan],
  );

  const buildExpensePayload = useCallback(
    (confirmDuplicate: boolean) => {
      if (!scanResult?.checkId) return null;
      return {
        init_data: tgRef.current?.initData ?? null,
        init_data_unsafe: tgRef.current?.initDataUnsafe ?? null,
        check_id: scanResult.checkId,
        amount: scanResult.amount ?? null,
        url: scanResult.url ?? scanResult.rawText,
        merchant: scanResult.merchant ?? null,
        receipt_date: scanResult.date ?? null,
        type: 'qr_scan',
        confirm_duplicate: confirmDuplicate,
      };
    },
    [scanResult],
  );

  const saveExpense = useCallback(
    async (confirmDuplicate: boolean) => {
      const payload = buildExpensePayload(confirmDuplicate);
      if (!payload) {
        setError('Missing check ID.');
        return false;
      }

      setSavingExpense(true);
      setError(null);

      try {
        const res = await fetch(`${apiBase}/api/expense`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.status === 409) {
          await logClient('expense_conflict', { status: 409 });
          const body = await res.json();
          const count = body?.detail?.existing_count ?? 1;
          setDuplicateCount(count);
          setShowDuplicatePrompt(true);
          return false;
        }

        if (!res.ok) {
          await logClient('expense_save_failed', { status: res.status });
          throw new Error('Failed to save expense.');
        }

        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save expense.');
        return false;
      } finally {
        setSavingExpense(false);
      }
    },
    [apiBase, buildExpensePayload],
  );

  useEffect(() => {
    scanResultRef.current = scanResult;
  }, [scanResult]);

  useEffect(() => {
    scanStatusRef.current = scanStatus;
  }, [scanStatus]);

  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp || null;
    tgRef.current = tg;

    if (!tg) {
      setScanEnabled(false);
      setError('Open this Mini App inside Telegram.');
      return;
    }

    const loadProfile = async () => {
      const params = new URLSearchParams();
      if (tg.initData) params.set('init_data', tg.initData);
      if (tg.initDataUnsafe) params.set('init_data_unsafe', JSON.stringify(tg.initDataUnsafe));
      try {
        const res = await fetch(`${apiBase}/api/user_profile?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        const premium = Boolean(data.is_premium);
        setIsPremium(premium);
        if (!premium) {
          setScanEnabled(false);
          setError('This feature is available for premium users only.');
        }
      } catch {}
    };
    loadProfile();

    tg.ready?.();
    tg.expand?.();
    logClient('scan_screen_open', {
      platform: tg.platform,
      version: tg.version,
      supports_scan: Boolean(tg.showScanQrPopup),
    });

    if (!tg.showScanQrPopup) {
      setScanEnabled(false);
      setError('QR scanning is not supported in this Telegram version.');
      logClient('scan_not_supported', { platform: tg.platform, version: tg.version });
      return;
    }

    const handler = (event: any) => {
      if (event?.data) {
        logClient('qr_text_received', { raw_text_len: String(event.data).length });
        handleQrText(event.data);
      }
    };

    tg.onEvent?.('qrTextReceived', handler);
    const closedHandler = () => {
      logClient('scan_popup_closed', {
        status: scanStatusRef.current,
        has_result: Boolean(scanResultRef.current),
      });
      setScanStatus((current) => {
        if (current === 'scanning' && !scanResultRef.current) {
          onBack();
        }
        return current === 'scanning' ? 'idle' : current;
      });
    };
    tg.onEvent?.('scanQrPopupClosed', closedHandler);

    const onVisibility = () => {
      logClient('visibility_change', { state: document.visibilityState });
    };
    const onPageHide = () => {
      logClient('page_hide', { state: document.visibilityState });
    };
    const onPageShow = () => {
      logClient('page_show', { state: document.visibilityState });
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      tg.offEvent?.('qrTextReceived', handler);
      tg.offEvent?.('scanQrPopupClosed', closedHandler);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [handleQrText, logClient, onBack]);

  const handleScan = () => {
    if (!isPremium) {
      showPremiumOnly();
      return;
    }
    if (!scanEnabled || scanStatus === 'saving') {
      return;
    }
    setError(null);
    setScanStatus('scanning');
    logClient('scan_popup_open', { status: scanStatusRef.current });
    tgRef.current?.showScanQrPopup?.({
      text: 'Point your camera at a QR code.',
    });
  };

  const handleConfirm = () => {
    if (savingExpense) return;
    saveExpense(false).then((ok) => {
      if (ok) {
        setScanResult(null);
        setScanStatus('idle');
        onBack();
      }
    });
  };

  const handleScanAgain = () => {
    setScanResult(null);
    setError(null);
    setScanStatus('idle');
    setShowDuplicatePrompt(false);
    setDuplicateCount(0);
    autoStartRef.current = false;
  };

  const handleEnterManually = () => {
    onBack();
  };

  const handleConfirmDuplicate = () => {
    setShowDuplicatePrompt(false);
    saveExpense(true).then((ok) => {
      if (ok) {
        setScanResult(null);
        setScanStatus('idle');
        onBack();
      }
    });
  };

  const hasSuccess = scanStatus === 'success' && scanResult;
  const isBusy = scanStatus === 'scanning' || scanStatus === 'saving';

  useEffect(() => {
    if (!scanEnabled || hasSuccess || isBusy) {
      return;
    }
    if (autoStartRef.current) {
      return;
    }
    autoStartRef.current = true;
    handleScan();
  }, [scanEnabled, hasSuccess, isBusy]);

  const amountText = scanResult?.amount ? `${scanResult.amount} ₴` : '—';
  const checkIdText = scanResult?.checkId || '—';
  const urlText = scanResult?.url || scanResult?.rawText || '—';

  return (
    <div className="flex flex-col h-full bg-[#151322]">
      {/* Header */}
      <div className="bg-[#1d1a2c] px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-lg transition-all"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-lg font-semibold text-white">Scan QR</h1>
        </div>
      </div>

      {/* Camera View */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {/* Mock Camera Background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#1d1a2c] to-[#151322]"></div>

        {/* QR Scanner Frame */}
        {!hasSuccess && (
          <div className="relative z-10 w-64 h-64">
            {/* Corner Borders */}
            <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-white rounded-tl-2xl"></div>
            <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-white rounded-tr-2xl"></div>
            <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-white rounded-bl-2xl"></div>
            <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-white rounded-br-2xl"></div>

            {/* Scanning Line */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
              <div className="h-1 bg-[var(--accent-from)] animate-pulse shadow-lg shadow-[var(--accent-glow-soft)]"></div>
            </div>

            {/* QR Code Icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-white/30">
                <ScanLine size={80} strokeWidth={1.5} />
              </div>
            </div>
          </div>
        )}

        {/* Helper Text */}
        {!hasSuccess && (
          <div className="absolute bottom-32 left-0 right-0 text-center px-6">
            <p className="text-white text-sm">
              {error
                ? error
                : isBusy
                  ? 'Scanning...'
                  : 'Scan receipt QR to auto-fill expense'}
            </p>
          </div>
        )}

        {/* Scan Result Modal */}
        {hasSuccess && (
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 z-20">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-6 shadow-[var(--accent-glow)] border border-white/60 animate-in fade-in slide-in-from-bottom-4">
              <div className="text-center mb-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl">✓</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  Scan stored
                </h3>
                <p className="text-sm text-gray-600">
                  Receipt data saved to history
                </p>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center py-2 border-b border-gray-200/70">
                  <span className="text-sm text-gray-600">Check ID</span>
                  <span className="font-medium text-gray-900">{checkIdText}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-200/70">
                  <span className="text-sm text-gray-600">Amount</span>
                  <span className="font-medium text-gray-900">{amountText}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-600">Source</span>
                  <span className="font-medium text-gray-900 truncate max-w-[140px]">
                    {urlText}
                  </span>
                </div>
              </div>

              <button
                onClick={handleConfirm}
                disabled={savingExpense}
                className="w-full py-3 bg-[var(--accent-from)] text-white rounded-xl font-medium hover:bg-[var(--accent-to)] transition-all mb-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingExpense ? 'Saving...' : 'Add Transaction'}
              </button>
              <button
                onClick={handleScanAgain}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all"
              >
                Scan Again
              </button>
            </div>
          </div>
        )}

        {showDuplicatePrompt && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 px-6">
            <div className="bg-white/95 rounded-2xl p-5 shadow-xl w-full max-w-xs border border-white/60">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Transaction already exists
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Цей чек уже збережений ({duplicateCount} запис). Додати ще раз?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleConfirmDuplicate}
                  className="flex-1 py-2.5 bg-[var(--accent-from)] text-white rounded-xl font-medium hover:bg-[var(--accent-to)] transition-all"
                >
                  Так
                </button>
                <button
                  onClick={() => setShowDuplicatePrompt(false)}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all"
                >
                  Ні
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      {!hasSuccess && (error || !scanEnabled) && (
        <div className="bg-[#1d1a2c] px-4 py-4 border-t border-white/10">
          <div className="flex gap-3">
            <button
              onClick={handleScan}
              disabled={!scanEnabled || isBusy}
              className="flex-1 py-3 bg-green-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-green-600 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Camera size={20} />
              Try Again
            </button>
            <button
              onClick={handleEnterManually}
              className="flex-1 py-3 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-all"
            >
              Enter Manually
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
