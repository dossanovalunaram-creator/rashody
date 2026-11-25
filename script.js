"use strict";

const STORAGE_KEY = "rashody.expenses.v1";
const BUDGET_STORAGE_KEY = "rashody.budget.v1";
const CATEGORIES = new Set(["Еда", "Транспорт", "Дом", "Другое"]);
const BUDGET_FIELDS = ["food", "transport", "home", "other"];
const BUDGET_CATEGORIES = {
  food: "Еда",
  transport: "Транспорт",
  home: "Дом",
  other: "Другое"
};

const form = document.querySelector("#expense-form");
const amountInput = document.querySelector("#amount");
const categoryInput = document.querySelector("#category");
const dateInput = document.querySelector("#date");
const commentInput = document.querySelector("#comment");
const formMessage = document.querySelector("#form-message");
const expenseList = document.querySelector("#expense-list");
const emptyState = document.querySelector("#empty-state");
const monthTotal = document.querySelector("#month-total");
const currentMonth = document.querySelector("#current-month");
const storageWarning = document.querySelector("#storage-warning");
const filterButtons = Array.from(document.querySelectorAll(".filter-button"));
const budgetForm = document.querySelector("#budget-form");
const budgetInputs = Object.fromEntries(BUDGET_FIELDS.map((field) => [
  field,
  document.querySelector(`#budget-${field}`)
]));
const budgetMessage = document.querySelector("#budget-message");
const budgetTotal = document.querySelector("#budget-total");
const budgetStatus = Object.fromEntries(BUDGET_FIELDS.map((field) => [
  field,
  {
    spent: document.querySelector(`#budget-${field}-spent`),
    balance: document.querySelector(`#budget-${field}-balance`),
    balanceLabel: document.querySelector(`#budget-${field}-balance-label`),
    balanceRow: document.querySelector(`#budget-${field}-balance-row`)
  }
]));

let expenses = loadExpenses();
let budget = loadBudget();
let activePeriod = "all";

dateInput.value = toDateInputValue(new Date());
currentMonth.textContent = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric"
}).format(new Date());

fillBudgetForm();
renderBudgetTotal();
render();

budgetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearBudgetErrors();

  const nextBudget = {};
  let firstInvalidField = null;

  for (const field of BUDGET_FIELDS) {
    const input = budgetInputs[field];
    const amountCents = parseAmountToCents(input.value);

    if (amountCents === null) {
      showError(input, "Введите сумму больше нуля, не более двух знаков после запятой.");
      firstInvalidField ||= input;
      continue;
    }

    nextBudget[field] = amountCents;
  }

  if (firstInvalidField) {
    budgetMessage.textContent = "Проверьте лимиты.";
    budgetMessage.classList.add("is-error");
    firstInvalidField.focus();
    return;
  }

  budget = nextBudget;
  saveBudget();
  renderBudgetTotal();
  renderBudgetStatus();
  budgetMessage.textContent = "Лимиты сохранены.";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearErrors();

  const amountCents = parseAmountToCents(amountInput.value);
  const category = categoryInput.value;
  const date = dateInput.value;
  const comment = commentInput.value.trim();
  let firstInvalidField = null;

  if (amountCents === null) {
    showError(amountInput, "Введите сумму больше нуля, не более двух знаков после запятой.");
    firstInvalidField = amountInput;
  }

  if (!CATEGORIES.has(category)) {
    showError(categoryInput, "Выберите категорию.");
    firstInvalidField ||= categoryInput;
  }

  if (!isValidDateValue(date)) {
    showError(dateInput, "Укажите корректную дату.");
    firstInvalidField ||= dateInput;
  }

  if (firstInvalidField) {
    formMessage.textContent = "Проверьте заполнение формы.";
    formMessage.classList.add("is-error");
    firstInvalidField.focus();
    return;
  }

  const expense = {
    id: createId(),
    amountCents,
    category,
    date,
    comment,
    createdAt: Date.now()
  };

  const nextExpenses = [expense, ...expenses];

  if (!saveExpenses(nextExpenses)) {
    formMessage.textContent = "Трата не сохранена. Разрешите браузеру хранить данные и попробуйте снова.";
    formMessage.classList.add("is-error");
    return;
  }

  expenses = nextExpenses;
  render();

  form.reset();
  dateInput.value = toDateInputValue(new Date());
  formMessage.textContent = "Трата добавлена.";
  amountInput.focus();
});

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    activePeriod = button.dataset.period;

    for (const item of filterButtons) {
      const isActive = item === button;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    }

    renderList();
  });
}

function render() {
  renderMonthTotal();
  renderBudgetStatus();
  renderList();
}

function renderMonthTotal() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth();
  const totalCents = expenses.reduce((total, expense) => {
    const expenseDate = parseLocalDate(expense.date);

    if (
      expenseDate &&
      expenseDate.getFullYear() === currentYear &&
      expenseDate.getMonth() === currentMonthIndex
    ) {
      return total + BigInt(expense.amountCents);
    }

    return total;
  }, 0n);

  monthTotal.textContent = formatBigIntAmount(totalCents);
}

function fillBudgetForm() {
  for (const field of BUDGET_FIELDS) {
    const amountCents = budget[field];
    budgetInputs[field].value = Number.isSafeInteger(amountCents)
      ? formatAmount(amountCents)
      : "";
  }
}

function renderBudgetTotal() {
  const totalCents = BUDGET_FIELDS.reduce((total, field) => {
    return total + BigInt(budget[field] || 0);
  }, 0n);

  budgetTotal.textContent = formatBigIntAmount(totalCents);
}

function renderBudgetStatus() {
  const spending = getCurrentMonthSpendingByCategory();

  for (const field of BUDGET_FIELDS) {
    const status = budgetStatus[field];
    const spentCents = spending[BUDGET_CATEGORIES[field]];
    const balanceCents = (budget[field] || 0) - spentCents;
    const isOverBudget = balanceCents < 0;

    status.spent.textContent = formatAmount(spentCents);
    status.balance.textContent = formatAmount(Math.abs(balanceCents));
    status.balanceLabel.textContent = isOverBudget ? "Перерасход" : "Осталось";
    status.balanceRow.classList.toggle("is-over-budget", isOverBudget);
  }
}

function getCurrentMonthSpendingByCategory() {
  const now = new Date();
  const spending = Object.fromEntries(Array.from(CATEGORIES, (category) => [category, 0]));

  for (const expense of expenses) {
    const expenseDate = parseLocalDate(expense.date);

    if (
      expenseDate &&
      expenseDate.getFullYear() === now.getFullYear() &&
      expenseDate.getMonth() === now.getMonth()
    ) {
      spending[expense.category] += expense.amountCents;
    }
  }

  return spending;
}

function renderList() {
  expenseList.replaceChildren();
  const visibleExpenses = expenses.filter(matchesActivePeriod);

  for (const expense of visibleExpenses) {
    const item = document.createElement("li");
    item.className = "expense-item";

    const category = document.createElement("p");
    category.className = "expense-item__category";
    category.textContent = expense.category;

    const amount = document.createElement("p");
    amount.className = "expense-item__amount";
    amount.textContent = `${formatAmount(expense.amountCents)} ₸`;

    const details = document.createElement("p");
    details.className = "expense-item__details";

    const date = document.createElement("time");
    date.dateTime = expense.date;
    date.textContent = formatDate(expense.date);
    details.append(date);

    if (expense.comment) {
      const comment = document.createElement("span");
      comment.className = "expense-item__comment";
      comment.textContent = expense.comment;
      details.append(comment);
    }

    const deleteButton = document.createElement("button");
    deleteButton.className = "expense-item__delete";
    deleteButton.type = "button";
    deleteButton.textContent = "Удалить";
    deleteButton.setAttribute(
      "aria-label",
      `Удалить трату ${formatAmount(expense.amountCents)} ₸, ${expense.category}, ${formatDate(expense.date)}`
    );
    deleteButton.addEventListener("click", () => deleteExpense(expense));

    item.append(category, amount, details, deleteButton);
    expenseList.append(item);
  }

  emptyState.hidden = visibleExpenses.length > 0;
  emptyState.textContent = expenses.length === 0
    ? "Трат пока нет."
    : "За выбранный период трат нет.";
}

function deleteExpense(expense) {
  const shouldDelete = window.confirm(
    `Удалить трату ${formatAmount(expense.amountCents)} ₸ в категории «${expense.category}»?`
  );

  if (!shouldDelete) {
    return;
  }

  expenses = expenses.filter((item) => item.id !== expense.id);
  saveExpenses();
  render();
}

function matchesActivePeriod(expense) {
  if (activePeriod === "all") {
    return true;
  }

  const expenseDate = parseLocalDate(expense.date);

  if (!expenseDate) {
    return false;
  }

  const today = startOfDay(new Date());

  if (activePeriod === "month") {
    return expenseDate.getFullYear() === today.getFullYear()
      && expenseDate.getMonth() === today.getMonth();
  }

  const daysByPeriod = { day: 1, "7days": 7, "14days": 14 };
  const periodDays = daysByPeriod[activePeriod];
  const firstDay = new Date(today);
  firstDay.setDate(firstDay.getDate() - periodDays + 1);

  return expenseDate >= firstDay && expenseDate <= today;
}

function parseAmountToCents(rawValue) {
  const normalized = rawValue.trim().replace(",", ".");

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");
  const cents = Number(wholePart) * 100 + Number(fractionPart.padEnd(2, "0"));

  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function formatAmount(amountCents) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amountCents / 100);
}

function formatBigIntAmount(amountCents) {
  const isNegative = amountCents < 0n;
  const absoluteCents = isNegative ? -amountCents : amountCents;
  const wholePart = absoluteCents / 100n;
  const fractionPart = String(absoluteCents % 100n).padStart(2, "0");
  const formattedWholePart = new Intl.NumberFormat("ru-RU").format(wholePart);

  return `${isNegative ? "-" : ""}${formattedWholePart},${fractionPart}`;
}

function formatDate(dateValue) {
  const date = parseLocalDate(dateValue);

  return date
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }).format(date)
    : dateValue;
}

function isValidDateValue(value) {
  return parseLocalDate(value) !== null;
}

function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function showError(input, message) {
  input.setAttribute("aria-invalid", "true");
  document.querySelector(`#${input.id}-error`).textContent = message;
}

function clearErrors() {
  formMessage.textContent = "";
  formMessage.classList.remove("is-error");

  for (const input of [amountInput, categoryInput, dateInput]) {
    input.removeAttribute("aria-invalid");
    document.querySelector(`#${input.id}-error`).textContent = "";
  }
}

function clearBudgetErrors() {
  budgetMessage.textContent = "";
  budgetMessage.classList.remove("is-error");

  for (const field of BUDGET_FIELDS) {
    const input = budgetInputs[field];
    input.removeAttribute("aria-invalid");
    document.querySelector(`#${input.id}-error`).textContent = "";
  }
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadExpenses() {
  try {
    const storedValue = localStorage.getItem(STORAGE_KEY);

    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(isStoredExpense);
  } catch (error) {
    showStorageWarning();
    return [];
  }
}

function saveExpenses(nextExpenses = expenses) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextExpenses));
    return true;
  } catch (error) {
    showStorageWarning();
    return false;
  }
}

function loadBudget() {
  try {
    const storedValue = localStorage.getItem(BUDGET_STORAGE_KEY);

    if (!storedValue) {
      return {};
    }

    const parsedValue = JSON.parse(storedValue);
    return isStoredBudget(parsedValue) ? parsedValue : {};
  } catch (error) {
    showStorageWarning();
    return {};
  }
}

function saveBudget() {
  try {
    localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(budget));
  } catch (error) {
    showStorageWarning();
  }
}

function isStoredBudget(value) {
  return Boolean(
    value &&
    BUDGET_FIELDS.every((field) => (
      Number.isSafeInteger(value[field]) && value[field] > 0
    ))
  );
}

function isStoredExpense(expense) {
  return Boolean(
    expense &&
    typeof expense.id === "string" &&
    Number.isSafeInteger(expense.amountCents) &&
    expense.amountCents > 0 &&
    CATEGORIES.has(expense.category) &&
    isValidDateValue(expense.date) &&
    typeof expense.comment === "string" &&
    expense.comment.length <= 200 &&
    Number.isFinite(expense.createdAt)
  );
}

function showStorageWarning() {
  if (storageWarning) {
    storageWarning.hidden = false;
  }
}
