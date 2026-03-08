## GET checks (open in browser)

- `/api/notifications/test`
- `/api/notifications/run`

## POST checks (DevTools; use `r.text()`)

```js
fetch('/api/notifications/test',{method:'POST',credentials:'include'}).then(r=>r.text()).then(console.log)
```

```js
fetch('/api/notifications/run',{method:'POST',credentials:'include'}).then(r=>r.text()).then(console.log)
```

