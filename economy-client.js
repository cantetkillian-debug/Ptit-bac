(() => {
  "use strict";
  const s = io({forceNew:true});
  const eco = {coins:0,lives:5,maxLives:5,nextLifeAt:null,secondsToNext:0,rewardedAdCoins:80};

  const token = () => localStorage.getItem("petitbac_walletToken") || "";

  function fmt(sec) {
    sec = Math.max(0,Math.floor(Number(sec)||0));
    const m = Math.floor(sec/60);
    return `${String(m).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;
  }

  function getState() {
    if (!token()) return setTimeout(getState,700);
    s.emit("economy:get",{walletToken:token()},res=>{
      if (!res?.ok) return;
      Object.assign(eco,res);
      draw();
      patchQuickPlay();
    });
  }

  function hud() {
    let el = document.getElementById("economyHud");
    if (!el) {
      el = document.createElement("div");
      el.id = "economyHud";
      el.className = "economy-hud";
      document.body.appendChild(el);
    }
    return el;
  }

  function draw() {
    const wait = eco.lives < eco.maxLives;
    hud().innerHTML = `
      <div class="economy-pill">🪙 <b>${Math.max(0,Number(eco.coins)||0)}</b></div>
      <div class="economy-pill life">♥ <b>${eco.lives}/${eco.maxLives}</b>${wait?`<small>${fmt(eco.secondsToNext)}</small>`:""}</div>`;
  }

  function patchQuickPlay() {
    const cost = document.querySelector(".home-v129-cost");
    if (cost) cost.innerHTML = `<span class="economy-heart">♥</span><b>1</b>`;
    const btn = document.getElementById("quickPlayBtn");
    if (btn) btn.disabled = eco.lives < 1;
  }

  s.on("connect",getState);
  s.on("economy:update",v=>{ if(v){Object.assign(eco,v);draw();patchQuickPlay();} });
  s.on("wallet:update",({balance}={})=>{
    if (Number.isFinite(Number(balance))) {
      eco.coins = Number(balance);
      localStorage.setItem("petitbac_walletBalance",String(balance));
      draw();
    }
  });

  setInterval(()=>{
    if (eco.lives < eco.maxLives && eco.nextLifeAt) {
      eco.secondsToNext = Math.max(0,Math.ceil((Number(eco.nextLifeAt)-Date.now())/1000));
      if (eco.secondsToNext <= 0) getState(); else draw();
    }
  },1000);

  setInterval(getState,60000);

  new MutationObserver(()=>patchQuickPlay()).observe(document.documentElement,{subtree:true,childList:true});

  window.PtitBacEconomy = {
    refresh:getState,
    state:()=>({...eco}),
    rewardedAdCoins:80
  };
})();
