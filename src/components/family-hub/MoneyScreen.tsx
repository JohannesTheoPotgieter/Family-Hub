import { type ChangeEvent, useMemo, useState } from 'react';
import { FoundationBlock, ScreenIntro } from './BaselineScaffold';
import { formatCurrency } from '../../lib/family-hub/format';
import { getTodayIso } from '../../lib/family-hub/date';
import type { ActualTransaction, PaymentItem, UserSetupProfile } from '../../lib/family-hub/storage';

type Props = {
  profile?: UserSetupProfile;
  payments: PaymentItem[];
  actualTransactions: ActualTransaction[];
  onSaveProfile: (next: UserSetupProfile) => void;
  onAddPayment: (payment: Omit<PaymentItem, 'id' | 'paid'>) => void;
  onTogglePaymentPaid: (id: string) => void;
  onAddTransaction: (transaction: Omit<ActualTransaction, 'id'>) => void;
  onUpdateTransaction: (id: string, transaction: Omit<ActualTransaction, 'id'>) => void;
};

type TransactionFilter = 'all' | 'income' | 'expense';

type EditorState = {
  id?: string;
  title: string;
  amount: string;
  date: string;
  kind: 'inflow' | 'outflow';
  category: string;
  receiptImage?: string;
  receiptFileName?: string;
};

const CATEGORIES = ['Groceries', 'Home', 'Kids', 'Health', 'Transport', 'Fun', 'Salary', 'Other'];

const newEditorState = (): EditorState => ({
  title: '',
  amount: '',
  date: getTodayIso(),
  kind: 'outflow',
  category: 'Other'
});

const cleanFileName = (fileName: string) =>
  fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .slice(0, 42);

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not load image.'));
    reader.readAsDataURL(file);
  });

const getMonthStamp = (iso: string) => iso.slice(0, 7);

export const MoneyScreen = (props: Props) => {
  const { profile, payments, actualTransactions, onAddPayment, onTogglePaymentPaid, onAddTransaction, onUpdateTransaction } = props;
  const [filter, setFilter] = useState<TransactionFilter>('all');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [isReceiptMode, setIsReceiptMode] = useState(false);
  const [receiptHelp, setReceiptHelp] = useState<string | null>(null);
  const [quickPaymentTitle, setQuickPaymentTitle] = useState('');
  const [quickPaymentAmount, setQuickPaymentAmount] = useState('');
  const [quickPaymentDate, setQuickPaymentDate] = useState(getTodayIso());

  const todayIso = getTodayIso();
  const currentMonth = getMonthStamp(todayIso);
  const monthlyTransactions = useMemo(
    () => actualTransactions.filter((item) => getMonthStamp(item.date) === currentMonth),
    [actualTransactions, currentMonth]
  );

  const monthlyIncome = profile?.monthlyIncome ?? 0;
  const openingBalance = profile?.openingBalance ?? 0;

  const spent = monthlyTransactions.filter((tx) => tx.kind === 'outflow').reduce((sum, tx) => sum + tx.amount, 0);
  const earned = monthlyTransactions.filter((tx) => tx.kind === 'inflow').reduce((sum, tx) => sum + tx.amount, 0);
  const balance = openingBalance + monthlyIncome + earned - spent;

  const visibleTransactions = useMemo(() => {
    const byFilter = actualTransactions.filter((tx) => {
      if (filter === 'income') return tx.kind === 'inflow';
      if (filter === 'expense') return tx.kind === 'outflow';
      return true;
    });

    return byFilter.sort((a, b) => b.date.localeCompare(a.date));
  }, [actualTransactions, filter]);


  const openManualEditor = () => {
    setIsReceiptMode(false);
    setReceiptHelp(null);
    setEditor(newEditorState());
  };

  const openEditEditor = (tx: ActualTransaction) => {
    setIsReceiptMode(false);
    setReceiptHelp(null);
    setEditor({
      id: tx.id,
      title: tx.title,
      amount: String(tx.amount),
      date: tx.date,
      kind: tx.kind,
      category: tx.category ?? 'Other',
      receiptImage: tx.receiptImage,
      receiptFileName: tx.receiptFileName
    });
  };

  const saveEditor = () => {
    if (!editor) return;

    const parsedAmount = Number.parseFloat(editor.amount.replace(',', '.'));
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0 || !editor.title.trim()) return;

    const payload: Omit<ActualTransaction, 'id'> = {
      title: editor.title.trim(),
      amount: parsedAmount,
      date: editor.date,
      kind: editor.kind,
      category: editor.category,
      receiptImage: editor.receiptImage,
      receiptFileName: editor.receiptFileName
    };

    if (editor.id) {
      onUpdateTransaction(editor.id, payload);
    } else {
      onAddTransaction(payload);
    }

    setEditor(null);
    setIsReceiptMode(false);
  };

  const onReceiptPicked = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const dataUrl = await fileToDataUrl(file);
      setIsReceiptMode(true);
      setReceiptHelp("We don't rely on advanced OCR yet. Please confirm details before saving.");
      setEditor({
        ...newEditorState(),
        title: cleanFileName(file.name) || 'Receipt purchase',
        receiptImage: dataUrl,
        receiptFileName: file.name
      });
    } catch {
      setReceiptHelp('Could not load this image. Please try another file.');
    }
  };

  const addPlannedPayment = () => {
    const parsedAmount = Number.parseFloat(quickPaymentAmount.replace(',', '.'));
    if (Number.isNaN(parsedAmount) || !quickPaymentTitle.trim()) return;

    onAddPayment({
      title: quickPaymentTitle.trim(),
      amount: parsedAmount,
      dueDate: quickPaymentDate
    });

    setQuickPaymentTitle('');
    setQuickPaymentAmount('');
    setQuickPaymentDate(getTodayIso());
  };

  return (
    <section className="stack-lg money-overview">
      <ScreenIntro
        badge="Money"
        title="Transactions"
        subtitle="Fast capture, clean list, and one-tap filters for family spending."
      />

      <article className="glass-panel money-hero stack-sm">
        <p className="eyebrow">This month</p>
        <h3 className={`money-net ${balance < 0 ? 'is-negative' : ''}`}>{formatCurrency(balance)}</h3>
        <div className="money-kpi-grid">
          <div className="money-kpi"><span>Opening</span><strong>{formatCurrency(openingBalance)}</strong></div>
          <div className="money-kpi"><span>Income</span><strong>{formatCurrency(monthlyIncome + earned)}</strong></div>
          <div className="money-kpi"><span>Spent</span><strong>{formatCurrency(spent)}</strong></div>
        </div>
      </article>

      <FoundationBlock title="Capture" description="Add manually or upload a receipt image and confirm quickly.">
        <div className="money-capture-actions">
          <button className="btn btn-primary" onClick={openManualEditor}>Add transaction</button>
          <label className="btn btn-ghost money-upload-btn">
            Upload receipt
            <input type="file" accept="image/*" onChange={onReceiptPicked} />
          </label>
        </div>
        {receiptHelp ? <p className="muted">{receiptHelp}</p> : null}
      </FoundationBlock>

      {editor ? (
        <article className="glass-panel money-editor stack-sm">
          <div className="money-editor-head">
            <p className="eyebrow">{editor.id ? 'Edit transaction' : isReceiptMode ? 'Confirm receipt' : 'Manual transaction'}</p>
            {editor.receiptFileName ? <span className="item-tag is-soft">{editor.receiptFileName}</span> : null}
          </div>
          {editor.receiptImage ? <img className="money-receipt-preview" src={editor.receiptImage} alt="Receipt preview" /> : null}
          <input
            value={editor.title}
            placeholder="Description"
            onChange={(event) => setEditor((current) => (current ? { ...current, title: event.target.value } : current))}
          />
          <div className="money-editor-grid">
            <input
              value={editor.amount}
              inputMode="decimal"
              placeholder="Amount"
              onChange={(event) => setEditor((current) => (current ? { ...current, amount: event.target.value } : current))}
            />
            <input
              type="date"
              value={editor.date}
              onChange={(event) => setEditor((current) => (current ? { ...current, date: event.target.value } : current))}
            />
          </div>
          <div className="money-editor-grid">
            <select
              value={editor.kind}
              onChange={(event) =>
                setEditor((current) => (current ? { ...current, kind: event.target.value as 'inflow' | 'outflow' } : current))
              }
            >
              <option value="outflow">Expense</option>
              <option value="inflow">Income</option>
            </select>
            <select
              value={editor.category}
              onChange={(event) => setEditor((current) => (current ? { ...current, category: event.target.value } : current))}
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div className="task-composer-actions">
            <button className="btn btn-ghost" onClick={() => setEditor(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveEditor}>{editor.id ? 'Save changes' : 'Save transaction'}</button>
          </div>
        </article>
      ) : null}

      <FoundationBlock title="Transactions" description="Easy to scan on mobile with clear visual direction.">
        <div className="money-filter-row" role="tablist" aria-label="Transaction filters">
          <button className={`filter-pill ${filter === 'all' ? 'is-active' : ''}`} onClick={() => setFilter('all')}>All</button>
          <button className={`filter-pill ${filter === 'income' ? 'is-active' : ''}`} onClick={() => setFilter('income')}>Income</button>
          <button className={`filter-pill ${filter === 'expense' ? 'is-active' : ''}`} onClick={() => setFilter('expense')}>Expense</button>
        </div>

        {visibleTransactions.length ? (
          <div className="stack-sm">
            {visibleTransactions.map((tx) => (
              <article key={tx.id} className="money-transaction-item">
                <div>
                  <p className="money-activity-title">{tx.title}</p>
                  <p className="muted">{tx.date} · {tx.category ?? 'Other'}</p>
                </div>
                <div className="money-activity-meta">
                  <strong className={tx.kind === 'outflow' ? 'money-negative' : 'money-positive'}>
                    {tx.kind === 'outflow' ? '-' : '+'}{formatCurrency(tx.amount)}
                  </strong>
                  <button className="money-inline-btn" onClick={() => openEditEditor(tx)}>Edit</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <article className="glass-panel money-empty stack-sm">
            <p className="money-empty-icon">🧾</p>
            <h3>No transactions yet</h3>
            <p className="muted">Add your first transaction manually or upload a receipt image to confirm and save.</p>
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={openManualEditor}>Add first transaction</button>
              <label className="btn btn-ghost money-upload-btn">
                Upload receipt
                <input type="file" accept="image/*" onChange={onReceiptPicked} />
              </label>
            </div>
          </article>
        )}
      </FoundationBlock>

      <FoundationBlock title="Planned payments" description="Optional due payments for upcoming bills.">
        <div className="money-editor-grid">
          <input value={quickPaymentTitle} placeholder="Payment name" onChange={(event) => setQuickPaymentTitle(event.target.value)} />
          <input value={quickPaymentAmount} inputMode="decimal" placeholder="Amount" onChange={(event) => setQuickPaymentAmount(event.target.value)} />
        </div>
        <div className="money-editor-grid">
          <input type="date" value={quickPaymentDate} onChange={(event) => setQuickPaymentDate(event.target.value)} />
          <button className="btn btn-ghost" onClick={addPlannedPayment}>Add planned payment</button>
        </div>
        <div className="stack-sm">
          {payments.slice(0, 4).map((item) => (
            <button key={item.id} className="money-activity-item" onClick={() => onTogglePaymentPaid(item.id)}>
              <div>
                <p className="money-activity-title">{item.title}</p>
                <p className="muted">Due {item.dueDate}</p>
              </div>
              <div className="money-activity-meta">
                <strong>{formatCurrency(item.amount)}</strong>
                <span className={`item-tag ${item.paid ? 'is-soft' : 'is-warn'}`}>{item.paid ? 'Paid' : 'Due'}</span>
              </div>
            </button>
          ))}
          {!payments.length ? <p className="muted">No planned payments yet.</p> : null}
        </div>
      </FoundationBlock>

    </section>
  );
};
