import { app } from './app.js';
import { initDb } from './lib/db.js';

const port = Number(process.env.PORT ?? 4000);

initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`MorphSwift server listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });