"use strict";

/**
 * P'tit Bac — codes amis V2
 * - 5 chiffres uniquement
 * - générés côté PostgreSQL
 * - uniques et indépendants du pseudo
 * - migration automatique des anciens codes (KIKI#1234, PLAYER#1234, etc.)
 */

const { Pool } = require("pg");

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
if (!DATABASE_URL) {
  console.warn("Codes amis V2 désactivés: DATABASE_URL absent.");
} else {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL)
      ? false
      : { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  let installed = false;
  let tries = 0;

  async function install() {
    if (installed) return;
    tries += 1;

    try {
      const table = await pool.query(`
        SELECT to_regclass('public.users') AS users_table
      `);

      if (!table.rows[0]?.users_table) {
        if (tries < 60) return setTimeout(install, 500);
        throw new Error("table public.users introuvable");
      }

      await pool.query(`
        CREATE OR REPLACE FUNCTION public.ptitbac_assign_friend_code_5()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
          candidate text;
        BEGIN
          IF NEW.friend_code ~ '^[0-9]{5}$' THEN
            RETURN NEW;
          END IF;

          LOOP
            candidate := lpad((floor(random() * 100000))::int::text, 5, '0');
            EXIT WHEN NOT EXISTS (
              SELECT 1
              FROM public.users
              WHERE friend_code = candidate
                AND id IS DISTINCT FROM NEW.id
            );
          END LOOP;

          NEW.friend_code := candidate;
          RETURN NEW;
        END;
        $$;
      `);

      await pool.query(`
        DROP TRIGGER IF EXISTS ptitbac_friend_code_5_trigger ON public.users;
        CREATE TRIGGER ptitbac_friend_code_5_trigger
        BEFORE INSERT OR UPDATE OF friend_code
        ON public.users
        FOR EACH ROW
        EXECUTE FUNCTION public.ptitbac_assign_friend_code_5();
      `);

      // Déclenche le trigger pour migrer les anciens codes.
      await pool.query(`
        UPDATE public.users
           SET friend_code = friend_code
         WHERE friend_code !~ '^[0-9]{5}$'
      `);

      installed = true;
      console.log("Codes amis V2 actifs: 5 chiffres uniques.");
    } catch (err) {
      if (tries < 60) {
        return setTimeout(install, 700);
      }
      console.error("Codes amis V2 initialisation impossible:", err.message);
    }
  }

  install();
}
