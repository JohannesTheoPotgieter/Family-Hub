import { useMemo, useState } from 'react';
import { formatCurrencyZAR } from '../../../lib/family-hub/money';
import { buildRollingPlannerSummary, getLineItemAmount, getPlannerCategories } from '../../../lib/family-hub/planner';
import { seedPlannerFromBills, type MoneyState, type PlannerLineItem } from '../../../lib/family-hub/storage';

type Props = {
  money: MoneyState;
  canEdit: boolean;
  onAddItem: (item: Omit<PlannerLineItem, 'id'>) => void;
  onUpdateItem: (id: string, update: Partial<PlannerLineItem>) => void;
  onDeleteItem: (id: string) => void;
  onSetOpeningBalance: (amountCents: number) => void;
  startMonth: string;
};

const fromInputToCents = (value: string) => {
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};
const fromCents = (cents: number) => String((cents / 100).toFixed(2));
const monthLabel = (monthIso: string) => {
  const [year, month] = monthIso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-ZA', { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1));
};

const getWindowMonths = (startMonth: string) => {
  const [year, month] = startMonth.split('-').map(Number);
  return Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(year, month - 1 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
};

export const PlannerTab = ({ money, canEdit, onAddItem, onUpdateItem, onDeleteItem, onSetOpeningBalance, startMonth }: Props) => {
  const [kindTab, setKindTab] = useState<'income' | 'expense'>('income');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composer, setComposer] = useState({ description: '', category: kindTab === 'income' ? 'Income' : 'Housing', isFixed: true, amount: '' });

  const months = useMemo(() => getWindowMonths(startMonth), [startMonth]);
  const summaries = useMemo(() => buildRollingPlannerSummary(money.plannerItems, money.plannerOpeningBalance, startMonth, 12), [money.plannerItems, money.plannerOpeningBalance, startMonth]);
  const totals = useMemo(() => summaries.reduce((acc, row) => ({ income: acc.income + row.totalIncome, expenses: acc.expenses + row.totalExpenses, net: acc.net + row.netCashFlow }), { income: 0, expenses: 0, net: 0 }), [summaries]);

  const kindItems = money.plannerItems.filter((item) => item.kind === kindTab);
  const categoryList = getPlannerCategories(money.plannerItems, kindTab);

  const grouped = categoryList.map((category) => ({
    category,
    items: kindItems.filter((item) => item.category === category),
    total: kindItems.filter((item) => item.category === category).reduce((sum, item) => sum + getLineItemAmount(item, startMonth), 0)
  }));

  return (
    <div className="stack-md">
      <article className="money-editor stack-sm">
        <label className="task-field">
          <span>Opening Account Balance</span>
          <input
            value={fromCents(money.plannerOpeningBalance)}
            onChange={(event) => onSetOpeningBalance(fromInputToCents(event.target.value))}
            inputMode="decimal"
            disabled={!canEdit}
          />
        </label>
        {money.plannerItems.length === 0 && money.bills.some((bill) => bill.recurrence === 'monthly') ? (
          <button
            className="btn btn-ghost"
            disabled={!canEdit}
            onClick={() => {
              const seeded = seedPlannerFromBills(money);
              seeded.plannerItems.forEach(({ id: _id, ...item }) => onAddItem(item));
            }}
          >
            Import recurring bills
          </button>
        ) : null}
      </article>

      <article className="money-editor stack-sm">
        <div className="planner-summary-strip">
          {summaries.map((row, index) => (
            <div key={row.monthIso} className={`planner-month-card ${index === 0 ? 'is-current' : ''} ${row.netCashFlow < 0 ? 'is-deficit' : ''}`}>
              <strong>{monthLabel(row.monthIso)}</strong>
              <span className="muted">Open {formatCurrencyZAR(row.openingBalance)}</span>
              <span className="money-positive">In {formatCurrencyZAR(row.totalIncome)}</span>
              <span className="money-negative">Out {formatCurrencyZAR(row.totalExpenses)}</span>
              <span className={`planner-net-value ${row.netCashFlow >= 0 ? 'positive' : 'negative'}`}>{formatCurrencyZAR(row.netCashFlow)}</span>
              <span className="muted">Close {formatCurrencyZAR(row.closingBalance)}</span>
            </div>
          ))}
        </div>
        <div className="money-brief-grid">
          <div>Total income: <strong>{formatCurrencyZAR(totals.income)}</strong></div>
          <div>Total expenses: <strong>{formatCurrencyZAR(totals.expenses)}</strong></div>
          <div>Net: <strong className={totals.net >= 0 ? 'money-positive' : 'money-negative'}>{formatCurrencyZAR(totals.net)}</strong></div>
        </div>
      </article>

      <article className="money-editor stack-sm">
        <div className="money-action-row">
          <button className={`chip-action ${kindTab === 'income' ? 'is-selected' : ''}`} onClick={() => { setKindTab('income'); setComposer((prev) => ({ ...prev, category: 'Income' })); }}>Income</button>
          <button className={`chip-action ${kindTab === 'expense' ? 'is-selected' : ''}`} onClick={() => { setKindTab('expense'); setComposer((prev) => ({ ...prev, category: 'Housing' })); }}>Expenses</button>
        </div>

        {grouped.map((group) => (
          <div key={group.category} className="planner-category-group">
            <button className="planner-category-header" onClick={() => setExpandedCategory(expandedCategory === group.category ? null : group.category)}>
              <span>{group.category}</span>
              <span>{formatCurrencyZAR(group.total)}</span>
            </button>
            {expandedCategory === group.category ? group.items.map((item) => (
              <div key={item.id}>
                <button className="planner-line-item-row" onClick={() => setEditingItemId(editingItemId === item.id ? null : item.id)}>
                  <span>{item.description}</span>
                  <span>{formatCurrencyZAR(item.defaultAmountCents)}</span>
                  <span>{Object.keys(item.monthlyOverrides).length > 0 ? 'Overrides' : 'Default'}</span>
                </button>
                {editingItemId === item.id ? (
                  <div className="stack-sm" style={{ padding: '10px 14px' }}>
                    <input value={item.description} onChange={(event) => onUpdateItem(item.id, { description: event.target.value })} disabled={!canEdit} />
                    <input value={item.category} list={`planner-category-${kindTab}`} onChange={(event) => onUpdateItem(item.id, { category: event.target.value })} disabled={!canEdit} />
                    <div className="money-editor-grid">
                      <label className="task-shared-toggle"><input type="checkbox" checked={item.isFixed} onChange={(event) => onUpdateItem(item.id, { isFixed: event.target.checked })} disabled={!canEdit} />Fixed</label>
                      <label className="task-shared-toggle"><input type="checkbox" checked={item.isActive} onChange={(event) => onUpdateItem(item.id, { isActive: event.target.checked })} disabled={!canEdit} />Active</label>
                    </div>
                    <input value={fromCents(item.defaultAmountCents)} onChange={(event) => onUpdateItem(item.id, { defaultAmountCents: fromInputToCents(event.target.value) })} inputMode="decimal" disabled={!canEdit} />
                    <div className="planner-override-grid">
                      {months.map((month) => {
                        const value = item.monthlyOverrides[month] ?? item.defaultAmountCents;
                        const isOverride = item.monthlyOverrides[month] !== undefined && item.monthlyOverrides[month] !== item.defaultAmountCents;
                        return (
                          <label key={month} className="stack-sm" style={{ gap: 4 }}>
                            <span className="muted" style={{ fontSize: '0.72rem' }}>{month.slice(5)}</span>
                            <input
                              className={`planner-month-input ${isOverride ? 'is-override' : ''}`}
                              value={fromCents(value)}
                              onChange={(event) => {
                                const nextValue = fromInputToCents(event.target.value);
                                const nextOverrides = { ...item.monthlyOverrides };
                                if (nextValue === item.defaultAmountCents) delete nextOverrides[month];
                                else nextOverrides[month] = nextValue;
                                onUpdateItem(item.id, { monthlyOverrides: nextOverrides });
                              }}
                              inputMode="decimal"
                              disabled={!canEdit}
                            />
                          </label>
                        );
                      })}
                    </div>
                    <button className="btn btn-danger-ghost" onClick={() => onDeleteItem(item.id)} disabled={!canEdit}>Delete</button>
                  </div>
                ) : null}
              </div>
            )) : null}
          </div>
        ))}

        <datalist id={`planner-category-${kindTab}`}>
          {getPlannerCategories(money.plannerItems, kindTab).map((category) => <option key={category} value={category} />)}
        </datalist>

        {composerOpen ? (
          <div className="stack-sm">
            <input placeholder="Description" value={composer.description} onChange={(event) => setComposer((prev) => ({ ...prev, description: event.target.value }))} />
            <input placeholder="Category" value={composer.category} list={`planner-category-${kindTab}`} onChange={(event) => setComposer((prev) => ({ ...prev, category: event.target.value }))} />
            <div className="money-editor-grid">
              <label className="task-shared-toggle"><input type="checkbox" checked={composer.isFixed} onChange={(event) => setComposer((prev) => ({ ...prev, isFixed: event.target.checked }))} />Fixed</label>
              <input placeholder="Default amount" inputMode="decimal" value={composer.amount} onChange={(event) => setComposer((prev) => ({ ...prev, amount: event.target.value }))} />
            </div>
            <div className="money-action-row">
              <button className="btn btn-primary" onClick={() => {
                onAddItem({ description: composer.description, category: composer.category || (kindTab === 'income' ? 'Income' : 'Expenses'), kind: kindTab, isFixed: composer.isFixed, monthlyOverrides: {}, defaultAmountCents: fromInputToCents(composer.amount), isActive: true });
                setComposerOpen(false);
                setComposer({ description: '', category: kindTab === 'income' ? 'Income' : 'Housing', isFixed: true, amount: '' });
              }} disabled={!canEdit || !composer.description.trim()}>Save</button>
              <button className="btn btn-ghost" onClick={() => setComposerOpen(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={() => setComposerOpen(true)} disabled={!canEdit}>+ Add {kindTab}</button>
        )}
      </article>
    </div>
  );
};
