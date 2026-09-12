(() => {
  "use strict";
  const state = { admin:false, infiniteCoins:false, infiniteLives:false, reports:[] };
  const token = () => String(window.session?.walletToken || localStorage.getItem("petitbac_walletToken") || "");
  const friendCode = () => String(localStorage.getItem("petitbac_friendCode") || "").replace(/^#/,"");
  const profile = () => window.getProfile?.() || {name:"Joueur"};

  function emit(name,payload={}) {
    return new Promise(resolve => socket.emit(name,{...payload,walletToken:token()},res=>resolve(res||{})));
  }

  async function refreshAdmin() {
    const r = await emit("admin:status");
    state.admin = !!r.admin;
    state.infiniteCoins = !!r.infiniteCoins;
    state.infiniteLives = !!r.infiniteLives;
    decorate();
  }

  function modal(inner, cls="") {
    document.querySelector(".admin-v1-overlay")?.remove();
    const el=document.createElement("div");
    el.className="admin-v1-overlay "+cls;
    el.innerHTML=`<div class="admin-v1-modal">${inner}</div>`;
    document.body.appendChild(el);
    el.addEventListener("click",e=>{ if(e.target===el) el.remove(); });
    return el;
  }

  function adminMenu() {
    const el=modal(`
      <button class="admin-v1-x" aria-label="Fermer">×</button>
      <div class="admin-v1-brand"><img src="/admin-crown.png"><div><small>ESPACE PRIVÉ</small><h2>Menu admin</h2></div></div>
      <p class="admin-v1-sub">Outils personnels et modération du jeu.</p>
      <section class="admin-v1-card">
        <h3>Mes avantages</h3>
        <label class="admin-v1-toggle"><span><b>Pièces infinies</b><small>Ton portefeuille ne diminue plus</small></span><input id="admCoins" type="checkbox" ${state.infiniteCoins?"checked":""}><i></i></label>
        <label class="admin-v1-toggle"><span><b>Vies infinies</b><small>Tes vies restent disponibles</small></span><input id="admLives" type="checkbox" ${state.infiniteLives?"checked":""}><i></i></label>
      </section>
      <section class="admin-v1-card">
        <h3>Ajouter des pièces</h3>
        <div class="admin-v1-fields">
          <label>ID du joueur<input id="admId" inputmode="numeric" maxlength="6" placeholder="#84251"></label>
          <label>Montant<input id="admAmount" inputmode="numeric" type="number" min="1" max="999999" placeholder="100"></label>
        </div>
        <button id="admValidate" class="admin-v1-primary">Valider</button>
      </section>
      <button id="admReports" class="admin-v1-reports"><span>⚑</span><div><b>Reports</b><small>Avis, joueurs et réponses signalées</small></div><strong>›</strong></button>
    `);
    el.querySelector(".admin-v1-x").onclick=()=>el.remove();
    const save=async()=>{
      const r=await emit("admin:selfSettings",{infiniteCoins:el.querySelector("#admCoins").checked,infiniteLives:el.querySelector("#admLives").checked});
      if(!r.ok) return toast(r.error||"Erreur");
      state.infiniteCoins=!!r.infiniteCoins; state.infiniteLives=!!r.infiniteLives;
      toast("Options admin enregistrées.");
    };
    el.querySelector("#admCoins").onchange=save; el.querySelector("#admLives").onchange=save;
    el.querySelector("#admValidate").onclick=async()=>{
      const r=await emit("admin:addCoins",{friendCode:el.querySelector("#admId").value.replace("#",""),amount:el.querySelector("#admAmount").value});
      toast(r.ok?`${r.name}: pièces ajoutées.`:(r.error||"Erreur"));
    };
    el.querySelector("#admReports").onclick=()=>reportsPage();
  }

  async function reportsPage() {
    const r=await emit("admin:reports");
    if(!r.ok) return toast(r.error||"Erreur");
    state.reports=r.reports||[];
    document.querySelector(".admin-v1-overlay")?.remove();
    setScreen(`<main class="screen admin-v1-page">
      <header><button id="admBack" class="admin-v1-back">‹</button><div><small>MODÉRATION</small><h1>Reports</h1></div><img src="/admin-crown.png"></header>
      <div class="admin-v1-tabs">
        <button data-filter="all" class="active">Tous</button><button data-filter="report-avis">Avis</button><button data-filter="report-bug">Réponses / bugs</button><button data-filter="report-joueur">Joueurs</button>
      </div>
      <div id="admReportList" class="admin-v1-list"></div>
      <footer class="ptb-shared-footer" aria-hidden="true"><img src="/shared-footer-v1.png" alt=""></footer>
    </main>`);
    document.getElementById("admBack").onclick=()=>window.renderProfile();
    const renderList=(filter="all")=>{
      const list=state.reports.filter(x=>filter==="all"||x.type===filter);
      document.getElementById("admReportList").innerHTML=list.length?list.map(x=>`
        <article class="admin-v1-report">
          <div class="admin-v1-report-top"><span class="admin-v1-badge ${x.type}">${x.type==="report-avis"?"AVIS":x.type==="report-joueur"?"JOUEUR":"RÉPONSE / BUG"}</span><time>${new Date(x.created_at).toLocaleString("fr-FR")}</time></div>
          <h3>${escapeHtml(x.player_name||"Joueur")} ${x.friend_code?`<small>#${escapeHtml(x.friend_code)}</small>`:""}</h3>
          ${x.category?`<p class="admin-v1-context">${escapeHtml(x.category)}${x.answer?` · « ${escapeHtml(x.answer)} »`:""}</p>`:""}
          <p>${escapeHtml(x.message||"Signalement")}</p>
          ${x.room_code?`<small>Salon ${escapeHtml(x.room_code)}</small>`:""}
        </article>`).join(""):`<div class="admin-v1-empty">Aucun report dans cette catégorie.</div>`;
    };
    renderList();
    document.querySelectorAll(".admin-v1-tabs button").forEach(b=>b.onclick=()=>{
      document.querySelectorAll(".admin-v1-tabs button").forEach(x=>x.classList.remove("active")); b.classList.add("active"); renderList(b.dataset.filter);
    });
  }

  function feedbackModal(type="report-avis") {
    const isBug=type==="report-bug";
    const el=modal(`
      <button class="admin-v1-x">×</button>
      <div class="admin-v1-feedback-icon">${isBug?"⚑":"✦"}</div>
      <h2>${isBug?"Signaler une réponse":"Donne-nous ton avis"}</h2>
      <p class="admin-v1-sub">${isBug?"Explique pourquoi tu penses que la réponse devrait être acceptée.":"Une idée ou quelque chose à améliorer ? Ton avis nous aide."}</p>
      <textarea id="feedbackText" maxlength="1000" placeholder="${isBug?"Explique le problème…":"Écris ton avis…"}"></textarea>
      <button id="feedbackSend" class="admin-v1-primary">Envoyer</button>
    `,"admin-v1-feedback");
    el.querySelector(".admin-v1-x").onclick=()=>el.remove();
    el.querySelector("#feedbackSend").onclick=async()=>{
      const r=await emit("feedback:submit",{type,message:el.querySelector("#feedbackText").value,friendCode:friendCode(),playerName:profile().name,roomCode:session?.code||""});
      if(r.ok){el.remove();toast("Merci, ton message a bien été envoyé !");} else toast(r.error||"Envoi impossible.");
    };
  }

  function adminActivationModal() {
    // Sécurité UX : cette fenêtre n'est accessible QUE depuis la page Mon profil.
    if (!document.querySelector(".profile-v2-final") || state.admin) return;

    const el = modal(`
      <button class="admin-v1-x" type="button" aria-label="Fermer">×</button>
      <div class="admin-v1-brand admin-v1-activation-brand">
        <img src="/admin-crown.png" alt="">
        <div>
          <small>ACCÈS PRIVÉ</small>
          <h2>Administration</h2>
        </div>
      </div>
      <p class="admin-v1-sub">
        Entre ton code administrateur pour lier ce compte à l'espace admin.
      </p>

      <label class="admin-v1-code-label">
        Code administrateur
        <input
          id="adminActivationCode"
          type="password"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="••••••••"
        >
      </label>

      <p id="adminActivationError" class="admin-v1-inline-error" hidden></p>

      <button id="adminActivationValidate" class="admin-v1-primary" type="button">
        Activer l'espace admin
      </button>
    `, "admin-v1-activation");

    const input = el.querySelector("#adminActivationCode");
    const error = el.querySelector("#adminActivationError");
    const validate = el.querySelector("#adminActivationValidate");

    el.querySelector(".admin-v1-x")?.addEventListener("click", () => el.remove());

    const submit = async () => {
      const code = String(input?.value || "").trim();
      if (!code) {
        error.hidden = false;
        error.textContent = "Entre le code administrateur.";
        return;
      }

      validate.disabled = true;
      error.hidden = true;

      const r = await emit("admin:claim", { code });

      if (!r.ok) {
        validate.disabled = false;
        error.hidden = false;
        error.textContent = r.error || "Activation impossible.";
        return;
      }

      el.remove();
      toast("Espace administrateur activé.");
      await refreshAdmin();

      // Reste sur Mon profil et affiche immédiatement la couronne.
      if (document.querySelector(".profile-v2-final")) decorate();
    };

    validate?.addEventListener("click", submit);
    input?.addEventListener("keydown", event => {
      if (event.key === "Enter") submit();
    });

    setTimeout(() => input?.focus(), 120);
  }

  function decorate() {
    const root=document.querySelector(".profile-v2-final");
    if(root && state.admin && !root.querySelector(".admin-v1-crown-btn")) {
      const b=document.createElement("button"); b.className="admin-v1-crown-btn"; b.type="button"; b.innerHTML='<img src="/admin-crown.png" alt="Admin">';
      b.onclick=adminMenu; root.appendChild(b);
    }
    // Bulle avis uniquement sur l'accueil, discrète au-dessus du footer.
    const home=document.querySelector(".home-v129,.home-v130,.home-v150");
    if(home && !home.querySelector(".admin-v1-feedback-bubble")) {
      const b=document.createElement("button"); b.className="admin-v1-feedback-bubble"; b.type="button"; b.innerHTML='<span>✦</span><b>Donne-nous ton avis</b>';
      b.onclick=()=>feedbackModal("report-avis"); home.appendChild(b);
    }
    // En complément du vrai answer:report déjà présent dans le serveur, propose un report-bug
    // sur les écrans de résultats si aucun bouton de contestation n'est visible.
    const text=(document.querySelector("#app")?.textContent||"").toLowerCase();
    if((text.includes("résultat")||text.includes("score")) && !document.querySelector(".admin-v1-answer-report")) {
      const b=document.createElement("button"); b.className="admin-v1-answer-report"; b.textContent="⚑ Signaler une réponse"; b.onclick=()=>feedbackModal("report-bug");
      document.querySelector("main.screen")?.appendChild(b);
    }
  }

  // Activation initiale :
  // 7 appuis rapides sur l'ID, uniquement quand la page Mon profil est affichée.
  // Aucun prompt() navigateur n'est utilisé.
  let taps = 0;
  let tapTimer = null;

  document.addEventListener("click", event => {
    const idButton = event.target.closest("#profileV2CopyId");
    const onProfilePage = !!document.querySelector(".profile-v2-final");

    if (!idButton || !onProfilePage || state.admin) return;

    taps += 1;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { taps = 0; }, 1800);

    if (taps >= 7) {
      taps = 0;
      clearTimeout(tapTimer);
      adminActivationModal();
    }
  }, true);

  const obs=new MutationObserver(()=>decorate());
  obs.observe(document.getElementById("app"),{childList:true,subtree:true});
  socket.on("connect",()=>setTimeout(refreshAdmin,300));
  setTimeout(refreshAdmin,600);
})();