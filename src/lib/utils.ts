export function formatPrice(amount: number | string | { toString(): string }) {
  const n = typeof amount === "number" ? amount : Number(amount.toString())
  return new Intl.NumberFormat("ar-EG").format(n) + " ج.م"
}

export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d)
}

export function formatDateTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

export function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}
