import React, { useState, useEffect } from 'react';
import {
  Landmark,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
  Edit2,
  Check,
} from 'lucide-react';
import { fetchCatererBankDetails, updateCatererBankDetails } from '../api';

interface BankDetailsManagerProps {
  catererId: string;
  initialCaterer?: any;
  onUpdated?: () => void;
}

export const BankDetailsManager: React.FC<BankDetailsManagerProps> = ({
  catererId,
  initialCaterer,
  onUpdated,
}) => {
  const [bankAccountHolderName, setBankAccountHolderName] = useState(
    initialCaterer?.bank_account_holder_name || ''
  );
  const [bankAccountNumber, setBankAccountNumber] = useState(
    initialCaterer?.bank_account_number || ''
  );
  const [confirmAccountNumber, setConfirmAccountNumber] = useState(
    initialCaterer?.bank_account_number || ''
  );
  const [bankIfsc, setBankIfsc] = useState(
    initialCaterer?.bank_ifsc || ''
  );
  const [bankName, setBankName] = useState(
    initialCaterer?.bank_name || ''
  );
  const [upiId, setUpiId] = useState(
    initialCaterer?.upi_id || ''
  );

  const [hasDetails, setHasDetails] = useState<boolean>(
    Boolean(initialCaterer?.bank_account_number && initialCaterer?.bank_ifsc)
  );
  const [isEditing, setIsEditing] = useState<boolean>(!hasDetails);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch current details from API
  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!catererId) return;
      try {
        setLoading(true);
        const res = await fetchCatererBankDetails(catererId);
        if (isMounted && res?.bankDetails) {
          const d = res.bankDetails;
          setBankAccountHolderName(d.bankAccountHolderName || '');
          setBankAccountNumber(d.bankAccountNumber || '');
          setConfirmAccountNumber(d.bankAccountNumber || '');
          setBankIfsc(d.bankIfsc || '');
          setBankName(d.bankName || '');
          setUpiId(d.upiId || '');
          setHasDetails(Boolean(d.hasBankDetails));
          if (d.hasBankDetails) {
            setIsEditing(false);
          }
        }
      } catch (err: any) {
        console.warn('Could not load bank details:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [catererId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validation 1: Holder Name
    if (!bankAccountHolderName.trim() || bankAccountHolderName.trim().length < 2) {
      setErrorMsg('Account holder legal name must be at least 2 characters.');
      return;
    }

    // Validation 2: Account Number format
    const accTrimmed = bankAccountNumber.trim();
    if (!/^\d{9,18}$/.test(accTrimmed)) {
      setErrorMsg('Bank account number must be between 9 and 18 numeric digits.');
      return;
    }

    // Validation 3: Confirmation match
    if (accTrimmed !== confirmAccountNumber.trim()) {
      setErrorMsg('Bank account numbers do not match. Please re-enter carefully.');
      return;
    }

    // Validation 4: IFSC code format (4 letters, 0, 6 letters/digits)
    const ifscUpper = bankIfsc.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscUpper)) {
      setErrorMsg('Invalid IFSC Code format. Example format: SBIN0001234 or HDFC0000123.');
      return;
    }

    // Validation 5: UPI ID format if provided
    if (upiId.trim() && !/^[\w.-]+@[\w.-]+$/.test(upiId.trim())) {
      setErrorMsg('Invalid UPI ID format. Example: business@okhdfcbank or merchant@upi.');
      return;
    }

    setSaving(true);
    try {
      const res = await updateCatererBankDetails(catererId, {
        bankAccountHolderName: bankAccountHolderName.trim(),
        bankAccountNumber: accTrimmed,
        bankIfsc: ifscUpper,
        bankName: bankName.trim() || undefined,
        upiId: upiId.trim() || undefined,
      });

      setSuccessMsg(res.message || 'Bank account details successfully saved!');
      setHasDetails(true);
      setIsEditing(false);
      if (onUpdated) onUpdated();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save bank details. Please check inputs.');
    } finally {
      setSaving(false);
    }
  };

  const getMaskedAccount = (acc: string) => {
    if (!acc || acc.length < 4) return '••••••••';
    const last4 = acc.slice(-4);
    return `•••• •••• ${last4}`;
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 border border-emerald-100">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Payout Bank Account</h2>
              {hasDetails ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="h-3 w-3" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
                  <AlertCircle className="h-3 w-3" />
                  Action Required
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Event catering earnings (85% net order value) are disbursed directly to this account via NEFT/IMPS.
            </p>
          </div>
        </div>

        {hasDetails && !isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs self-start sm:self-auto"
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>Update Details</span>
          </button>
        )}
      </div>

      {successMsg && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
          <Check className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
          Loading banking credentials...
        </div>
      ) : hasDetails && !isEditing ? (
        /* Read-Only Summary Card */
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
          <div>
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Account Holder Name
            </span>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {bankAccountHolderName}
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Bank Account Number
            </span>
            <p className="mt-1 text-sm font-mono font-bold text-slate-800">
              {getMaskedAccount(bankAccountNumber)}
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              IFSC Code
            </span>
            <p className="mt-1 text-sm font-mono font-semibold text-slate-800">
              {bankIfsc}
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Bank Name &amp; Branch
            </span>
            <p className="mt-1 text-sm text-slate-700">
              {bankName || 'Standard Commercial Bank'}
            </p>
          </div>

          {upiId && (
            <div>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Business UPI ID
              </span>
              <p className="mt-1 text-sm font-mono text-purple-700 font-medium">
                {upiId}
              </p>
            </div>
          )}

          <div>
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Disbursement Method
            </span>
            <p className="mt-1 text-xs text-emerald-700 font-medium flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Direct Bank Transfer (NEFT/IMPS)
            </p>
          </div>
        </div>
      ) : (
        /* Edit / Setup Form */
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {!hasDetails && (
            <div className="rounded-lg bg-amber-50 p-3.5 text-xs text-amber-900 border border-amber-200 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-bold text-amber-950">Bank Account Required for Payouts</p>
                <p className="mt-0.5 text-amber-800 leading-relaxed">
                  Enter your official business or proprietary bank account where you wish to receive catering advance payments and event balance disbursements.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Account Holder Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={bankAccountHolderName}
                onChange={(e) => setBankAccountHolderName(e.target.value)}
                placeholder="As per bank passbook / cheque"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden transition"
              />
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                Must match your registered business or legal name
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bank Name &amp; Branch
              </label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. State Bank of India, Tirupati Branch"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bank Account Number <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                required
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="Enter 9 to 18 digit account number"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Confirm Account Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={confirmAccountNumber}
                onChange={(e) => setConfirmAccountNumber(e.target.value)}
                placeholder="Re-enter account number to confirm"
                className={`w-full rounded-lg border px-3 py-2 text-xs text-slate-900 font-mono outline-hidden transition ${
                  confirmAccountNumber && bankAccountNumber !== confirmAccountNumber
                    ? 'border-red-400 bg-red-50/50'
                    : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                }`}
              />
              {confirmAccountNumber && bankAccountNumber !== confirmAccountNumber && (
                <span className="text-[11px] text-red-600 font-medium mt-0.5 block">
                  Account numbers do not match
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                IFSC Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={11}
                value={bankIfsc}
                onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                placeholder="e.g. SBIN0001234"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 font-mono uppercase focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden transition"
              />
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                11-character code found on cheque leaf or passbook
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Business UPI ID <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="e.g. caterer@okhdfcbank"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden transition"
              />
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                For instant UPI-based settlements when enabled
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Lock className="h-3.5 w-3.5 text-slate-400" />
              <span>Details are securely stored and verified before transfer</span>
            </div>

            <div className="flex items-center gap-2">
              {hasDetails && (
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={saving || (Boolean(confirmAccountNumber) && bankAccountNumber !== confirmAccountNumber)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800 disabled:opacity-50 transition"
              >
                {saving ? (
                  <span>Saving Details...</span>
                ) : (
                  <>
                    <span>Save Bank Details</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
