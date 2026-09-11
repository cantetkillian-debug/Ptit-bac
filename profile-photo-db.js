(() => {
  "use strict";

  const DB_NAME = "ptitbac_profile_db";
  const DB_VERSION = 1;
  const STORE = "profile_assets";
  const PHOTO_KEY = "custom_avatar";
  const KIND_KEY = "petitbac_profile_avatar_kind";
  const ICON_KEY = "petitbac_profile_icon";

  function isImageAvatar(value) {
    return typeof value === "string" && /^data:image\/(?:png|jpeg|webp);base64,/i.test(value);
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("IndexedDB indisponible"));
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Impossible d'ouvrir la base locale"));
    });
  }

  async function savePhoto(dataUrl) {
    if (!isImageAvatar(dataUrl)) throw new Error("Image invalide");
    const db = await openDb();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({
        key: PHOTO_KEY,
        dataUrl,
        updatedAt: Date.now()
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Impossible d'enregistrer la photo"));
    });

    db.close();
    localStorage.setItem(KIND_KEY, "photo");
    localStorage.setItem(ICON_KEY, dataUrl);
    return dataUrl;
  }

  async function loadPhoto() {
    try {
      const db = await openDb();
      const value = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(PHOTO_KEY);
        req.onsuccess = () => resolve(req.result?.dataUrl || "");
        req.onerror = () => reject(req.error);
      });
      db.close();
      return value;
    } catch {
      return "";
    }
  }

  async function hydrateSelectedPhoto() {
    if (localStorage.getItem(KIND_KEY) !== "photo") return "";
    const current = localStorage.getItem(ICON_KEY) || "";
    if (isImageAvatar(current)) return current;

    const saved = await loadPhoto();
    if (saved) localStorage.setItem(ICON_KEY, saved);
    return saved;
  }

  function markEmoji(icon) {
    localStorage.setItem(KIND_KEY, "emoji");
    if (icon) localStorage.setItem(ICON_KEY, icon);
  }

  function fileToProcessedDataUrl(file, maxSize = 256, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file || !String(file.type || "").startsWith("image/")) {
        return reject(new Error("Choisis une image."));
      }

      // 8 Mo max avant compression.
      if (Number(file.size || 0) > 8 * 1024 * 1024) {
        return reject(new Error("La photo est trop lourde (8 Mo maximum)."));
      }

      const reader = new FileReader();

      reader.onerror = () => reject(new Error("Impossible de lire la photo."));
      reader.onload = () => {
        const img = new Image();

        img.onerror = () => reject(new Error("Format d'image non pris en charge."));
        img.onload = () => {
          const side = Math.min(img.naturalWidth, img.naturalHeight);
          const sx = Math.max(0, (img.naturalWidth - side) / 2);
          const sy = Math.max(0, (img.naturalHeight - side) / 2);

          const canvas = document.createElement("canvas");
          canvas.width = maxSize;
          canvas.height = maxSize;

          const ctx = canvas.getContext("2d", { alpha: false });
          ctx.fillStyle = "#0a1d58";
          ctx.fillRect(0, 0, maxSize, maxSize);
          ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);

          // JPEG réduit fortement la taille afin d'éviter de surcharger le profil.
          const dataUrl = canvas.toDataURL("image/jpeg", quality);

          if (dataUrl.length > 450_000) {
            return reject(new Error("La photo reste trop lourde après compression."));
          }

          resolve(dataUrl);
        };

        img.src = String(reader.result || "");
      };

      reader.readAsDataURL(file);
    });
  }

  function avatarHtml(value, className = "") {
    if (isImageAvatar(value)) {
      return `<img class="${className}" src="${value}" alt="" draggable="false">`;
    }
    return `<span>${typeof escapeHtml === "function" ? escapeHtml(value || "🐼") : (value || "🐼")}</span>`;
  }

  window.PtitBacProfilePhoto = {
    isImageAvatar,
    savePhoto,
    loadPhoto,
    hydrateSelectedPhoto,
    markEmoji,
    fileToProcessedDataUrl,
    avatarHtml
  };

  // Restaure la photo sélectionnée depuis IndexedDB avant les prochaines ouvertures d'écran.
  hydrateSelectedPhoto().catch(() => {});
})();