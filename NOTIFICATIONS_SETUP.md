# Notifications setup

## Check GET in browser

- `/api/notifications/test`
- `/api/notifications/run`

## Call POST from DevTools (use .text())

```js
fetch("/api/notifications/test", { method: "POST", credentials: "include" })
  .then((r) => r.text())
  .then(console.log)
```

```js
fetch("/api/notifications/run", { method: "POST", credentials: "include" })
  .then((r) => r.text())
  .then(console.log)
```

