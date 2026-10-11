# bookmgmt (Angular)

Angular port of the React + Vite book management frontend. Same Spring Boot API (`http://localhost:8080/api`).

```bash
npm install
npm start        # http://localhost:4200
```

The Spring Boot CORS config must allow `http://localhost:4200` (the React app ran on 5173).
The API URL lives in `src/app/api.config.ts`.
