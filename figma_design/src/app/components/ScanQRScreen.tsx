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
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanEnabled, setScanEnabled] = useState(true);
  const [savingExpense, setSavingExpense] = useState(false);
  const [showDuplicatePrompt, setShowDuplicatePrompt] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);

  const apiBase = import.meta.env?.VITE_API_BASE?.replace(/\/$/, '') ?? '';

  const submitScan = useCallback(
    async (rawText: string) => {
      const tg = tgRef.current;
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
        throw new Error('Failed to store scan.');
      }

      return res.json();
    },
    [apiBase],
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
        if (tgRef.current?.sendData) {
          tgRef.current.sendData(rawText);
        }
        setScanStatus('success');
      } catch (err) {
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
          const body = await res.json();
          const count = body?.detail?.existing_count ?? 1;
          setDuplicateCount(count);
          setShowDuplicatePrompt(true);
          return false;
        }

        if (!res.ok) {
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
    const tg = (window as any)?.Telegram?.WebApp || null;
    tgRef.current = tg;

    if (!tg) {
      setScanEnabled(false);
      setError('Open this Mini App inside Telegram.');
      return;
    }

    tg.ready?.();
    tg.expand?.();

    if (!tg.showScanQrPopup) {
      setScanEnabled(false);
      setError('QR scanning is not supported in this Telegram version.');
      return;
    }

    const handler = (event: any) => {
      if (event?.data) {
        handleQrText(event.data);
      }
    };

    tg.onEvent?.('qrTextReceived', handler);
    const closedHandler = () => {
      setScanStatus((current) => {
        if (current === 'scanning' && !scanResultRef.current) {
          onBack();
        }
        return current === 'scanning' ? 'idle' : current;
      });
    };
    tg.onEvent?.('scanQrPopupClosed', closedHandler);

    return () => {
      tg.offEvent?.('qrTextReceived', handler);
      tg.offEvent?.('scanQrPopupClosed', closedHandler);
    };
  }, [handleQrText, onBack]);

  const handleScan = () => {
    if (!scanEnabled || scanStatus === 'saving') {
      return;
    }
    setError(null);
    setScanStatus('scanning');
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
              <div className="h-1 bg-[color:var(--brand-gold)] animate-pulse shadow-lg shadow-[0_0_16px_rgba(246,195,67,0.5)]"></div>
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
            <div className="bg-card rounded-2xl p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
              <div className="text-center mb-4">
                <div className="w-16 h-16 bg-[color:var(--brand-green)]/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl">✓</span>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">
                  Scan stored
                </h3>
                <p className="text-sm text-muted-foreground">
                  Receipt data saved to history
                </p>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center py-2 border-b border-[color:var(--brand-lavender)]">
                  <span className="text-sm text-muted-foreground">Check ID</span>
                  <span className="font-medium text-foreground">{checkIdText}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[color:var(--brand-lavender)]">
                  <span className="text-sm text-muted-foreground">Amount</span>
                  <span className="font-medium text-foreground">{amountText}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-muted-foreground">Source</span>
                  <span className="font-medium text-foreground truncate max-w-[140px]">
                    {urlText}
                  </span>
                </div>
              </div>

              <button
                onClick={handleConfirm}
                disabled={savingExpense}
                className="w-full py-3 bg-[color:var(--brand-purple)] text-white rounded-xl font-medium hover:bg-[color:var(--brand-purple-dark)] transition-all mb-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingExpense ? 'Saving...' : 'Add Expense'}
              </button>
              <button
                onClick={handleScanAgain}
                className="w-full py-3 bg-[color:var(--brand-lavender)] text-[color:var(--brand-purple-dark)] rounded-xl font-medium hover:bg-[color:var(--brand-lavender-dark)] transition-all"
              >
                Scan Again
              </button>
            </div>
          </div>
        )}

        {showDuplicatePrompt && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 px-6">
            <div className="bg-card rounded-2xl p-5 shadow-xl w-full max-w-xs">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Expense already exists
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Цей чек уже збережений ({duplicateCount} запис). Додати ще раз?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleConfirmDuplicate}
                  className="flex-1 py-2.5 bg-[color:var(--brand-purple)] text-white rounded-xl font-medium hover:bg-[color:var(--brand-purple-dark)] transition-all"
                >
                  Так
                </button>
                <button
                  onClick={() => setShowDuplicatePrompt(false)}
                  className="flex-1 py-2.5 bg-[color:var(--brand-lavender)] text-[color:var(--brand-purple-dark)] rounded-xl font-medium hover:bg-[color:var(--brand-lavender-dark)] transition-all"
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
              className="flex-1 py-3 bg-[color:var(--brand-green)] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[color:var(--brand-green-dark)] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
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
