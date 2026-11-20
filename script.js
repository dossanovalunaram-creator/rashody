"use strict";

const STORAGE_KEY = "rashody.expenses.v1";
const CATEGORIES = new Set(["Еда", "Транспорт", "Дом", "Другое"]);

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

let expenses = loadExpenses();
let activePeriod = "all";

dateInput.value = toDateInputValue(new Date());
currentMonth.textContent = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric"
}).format(new Date());

render();

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

  expenses.unshift(expense);
  saveExpenses();
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
      return total + expense.amountCents;
    }

    return total;
  }, 0);

  monthTotal.textContent = formatAmount(totalCents);
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

    item.append(category, amount, details);
    expenseList.append(item);
  }

  emptyState.hidden = visibleExpenses.length > 0;
  emptyState.textContent = expenses.length === 0
    ? "Трат пока нет."
    : "За выбранный период трат нет.";
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
  const normalized = rawValue.trim().replace(/\s/g, "").replace(",", ".");

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

function saveExpenses() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  } catch (error) {
    showStorageWarning();
  }
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
