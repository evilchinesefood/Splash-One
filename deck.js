// Flight-deck card illustrations share the aircraft meshes used in flight.
window.PatrolDeck = (() => {
  const regions = {
    lake: {name: "Autumn Lake District", description: "Fly among island forests and mountain lakes.", accent: "#c6cf8e"},
    mesa: {name: "Painted Mesa", description: "Follow the river between red sandstone mesas.", accent: "#efa77c"},
  };
  function skies(region) {
    return {
      day: {name: region === "mesa" ? "Daylight" : "Golden hour", description: region === "mesa" ?
        "Clear skies above sunlit sandstone." : "Long shadows and peach clouds at sunset.", accent: "#ffcc87"},
      night: {name: "Moonlight", description: "Stars and navigation lights over a moonlit horizon.", accent: "#a8bbf0"},
      storm: {name: "Storm", description: "Dark cloud banks and driving rain.", accent: "#84cfdb"},
    };
  }
  const aircraftAccents = {kestrel: "#f3b78f", needle: "#86d5cf", manta: "#ec9569"};
  const groups = {
    airframePick: {label: "Aircraft", title: "Choose an aircraft"},
    regionPick: {label: "Region", title: "Choose a region"},
    lightPick: {label: "Sky", title: "Choose a sky"},
  };

  function landscape(region, mode) {
    const canvas = document.createElement("canvas");
    canvas.width = 144;
    canvas.height = 64;
    canvas.setAttribute("aria-hidden", "true");
    const ctx = canvas.getContext("2d");
    const night = mode === "night", storm = mode === "storm", mesa = region === "mesa";
    const palette = night ? ["#22263e","#353756","#52546d","#615675","#44455e","#414a68","#273749"] :
      storm ? ["#3b4155","#576070","#848b96","#7a818d","#505e6e","#657985","#344958"] :
      mesa ? ["#75b4bd","#afc8b8","#eed39c","#c58472","#a75746","#69b9b8","#683d43"] :
      ["#817d9e","#c7979f","#fbd3a4","#a78c93","#68616c","#82a5a4","#464757"];
    function rect(x,y,w,h,col) {ctx.fillStyle=col;ctx.fillRect(x,y,w,h);}
    function poly(points,col) {
      ctx.fillStyle=col; ctx.beginPath();
      points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
      ctx.closePath();ctx.fill();
    }
    const skyCard = mode !== null;
    const dy = skyCard ? 15 : 0;
    rect(0,0,144,64,palette[0]);rect(0,18+dy,144,16,palette[1]);rect(0,30+dy,144,34,palette[2]);
    if (storm) {
      for (let i=0;i<7;i++) {
        const x=i*28-13,y=7+(i*11)%12;
        rect(x-4,y,37,12,"#505666");rect(x,y+9,27,5,"#656c7c");
        rect(x+3,y-4,20,8,"#505666");rect(x-7,y-2,31,10,"#383f51");
      }
    } else if (night) {
      for (let i=0;i<29;i++) rect((i*47+4)%144,(i*11+i*i)%32,1,1,i%3?"#abb2cc":"#ede8c7");
      rect(103,7,8,11,"#ffedc8");rect(101,9,10,7,"#ffedc8");rect(104,6,8,9,palette[0]);
    } else {
      if (skyCard) {
        rect(76,12,19,24,"#ffdf9f"); rect(72,17,27,15,"#ffdf9f");
        rect(73,19,25,9,"#fff0b6"); rect(84,30,32,3,"#ecc2a6");
      } else {
        rect(91,9,13,15,"#ffdf9f"); rect(89,12,17,9,"#fff0b6");
      }
      for (const [x,y,w] of [[8,10,29],[34,13,13],[109,17,26],[60,8,17]]) {
        rect(x,y,w,3,"#e5b9ab");rect(x+5,y-2,w-9,3,"#f3cbb2");
      }
    }
    ctx.save();ctx.translate(0,dy);
    if (mesa) {
      poly([[0,36],[14,33],[18,24],[31,24],[34,33],[50,35],[57,26],[71,26],[73,33],[90,36],[111,29],[121,29],[127,35],[144,35],[144,64],[0,64]],palette[3]);
      poly([[0,25],[15,25],[20,38],[37,42],[59,44],[86,43],[104,39],[112,29],[128,29],[130,22],[144,22],[144,64],[0,64]],palette[4]);
      poly([[0,32],[15,32],[17,36],[3,36],[12,43],[32,46],[18,47],[0,44]],palette[6]);
      poly([[144,30],[131,30],[128,34],[141,34],[132,40],[110,43],[139,44],[144,42]],palette[6]);
      poly([[67,41],[77,41],[63,46],[80,49],[115,55],[126,64],[51,64],[88,55],[52,48]],palette[5]);
    } else {
      poly([[0,36],[15,28],[28,33],[45,24],[56,30],[75,22],[94,33],[107,28],[128,34],[144,24],[144,42],[0,42]],palette[3]);
      poly([[0,38],[19,32],[29,35],[36,31],[50,37],[78,39],[101,35],[119,32],[144,37],[144,43],[0,43]],palette[4]);
      rect(0,40,144,24,palette[5]);
      for(let i=0;i<28;i++)rect((i*43)%144,42+(i*13)%23,2+i%6,1,palette[2]);
      const trees=night||storm?[palette[4],palette[6]]:["#985d52","#5a555b","#b77c4f","#6c6252"];
      for (let i=0;i<22;i++) {
        const x=(i*9)%144, y=x<56?43+(x-25)*(x-25)*.002:45+(x-109)*(x-109)*.013;
        if(x>56&&x<88)continue;
        const h=4+(i*7)%7;poly([[x-4,y],[x,y-h],[x+4,y]],trees[i%trees.length]);
      }
      poly([[0,45],[25,43],[58,47],[35,48],[0,51]],palette[6]);
      poly([[84,49],[103,46],[129,43],[144,45],[144,49],[113,49]],palette[6]);
    }
    ctx.restore();
    if(storm)for(let i=0;i<55;i++) {
      const x=(i*61)%144,y=7+(i*29)%56;
      rect(x,y,1,2,"#9ba8b4");rect(x-1,y+2,1,2,"#9ba8b4");
    }
    return canvas;
  }

  function node(tag, className, text) {
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(text)el.textContent=text;
    return el;
  }
  function create() {
    const dialog=document.getElementById("deckPicker"), choices=document.getElementById("deckChoices");
    const buttons=Object.keys(groups).map(id=>document.getElementById(id));
    const region=()=>document.getElementById("regionPick").value;
    const getOptions=id=>id==="airframePick" ? PatrolGame.airframes : id==="regionPick" ? regions : skies(region());
    function art(id,key) {
      const image=node("span",id==="airframePick"?"deck-art aircraft-art":"deck-art");
      image.append(id==="airframePick"?PatrolArt.aircraftPortrait(key):landscape(id==="regionPick"?key:region(),id==="regionPick"?null:key));
      return image;
    }
    function refresh() {
      for(const btn of buttons){
        const option=getOptions(btn.id)[btn.value];
        const content=node("span","deck-pick-copy");
        content.append(node("small",null,groups[btn.id].label),node("strong",null,option.name));
        btn.style.setProperty("--accent",option.accent||aircraftAccents[btn.value]);
        btn.replaceChildren(art(btn.id,btn.value),content);
        btn.setAttribute("aria-label",groups[btn.id].label+" · "+option.name+". Change selection");
      }
    }
    function fillChoices(btn) {
      const chosen=btn.value;
      const options=Object.entries(getOptions(btn.id)), aircraft=btn.id==="airframePick";
      choices.classList.toggle("deck-aircraft",aircraft);
      choices.style.setProperty("--count",options.length);
      document.getElementById("deckPickerTitle").textContent=groups[btn.id].title;
      const profile=aircraft ? PatrolHangar.read() : null;
      choices.replaceChildren(...options.map(([key,option])=>{
        const card=node("button","deck-option");
        card.type="button";card.dataset.choice=key;
        card.setAttribute("aria-pressed",String(key===chosen));
        card.style.setProperty("--accent",option.accent||aircraftAccents[key]);
        const image=art(btn.id,key),copy=node("span","choice-copy");
        if(key===chosen)image.append(node("span","deck-selected","✓ Selected"));
        copy.append(node("strong","choice-name",option.name));
        const ranks = aircraft ? profile.ships[key] : null;
        const f = aircraft ? PatrolGame.tunedFrame(key, ranks) : null;
        let detail = option.description;
        if (f) {
          const power = key === "manta" ? "3 × " + f.damage : f.damage;
          copy.append(node("span","choice-weapon",option.weapon + " · " + power + " dmg"));
          if (ranks.specialty) {
            if (key === "needle") detail = "Ion bolts pierce " + (2 + ranks.specialty) + " aligned targets.";
            if (key === "manta") detail = "Three rounds with a " + (15 * ranks.specialty) + "% tighter spread.";
            if (key === "kestrel") detail = "Two extra rounds every " + ["", "sixth", "fifth", "fourth"][ranks.specialty] + " volley.";
          }
        }
        copy.append(node("span","choice-desc",detail));
        card.append(image,copy);
        if (f) {
          const stats = node("span","choice-stats");
          for(const [name,value] of [["Cruise",Math.round(f.cruise*1.94384)+" kt"],["Turn",Math.round(f.handling*1.5*180/Math.PI)+"°/s"],["Armor",Math.round(f.armor*100)+"%"],["Hull",f.maxHull],["Shield",f.maxShield],["Fire rate",Number(f.rate.toFixed(1))+"/s"]]) {
            const stat=node("span","choice-stat");
            stat.append(node("span",null,name),node("b",null,String(value)));
            stats.append(stat);
          }
          card.append(stats);
        }
        card.onclick=()=>{
          dialog.close();
          if(btn.value!==key){
            btn.value=key; btn.dispatchEvent(new Event("change",{bubbles:true}));
            refresh();
          }
        };
        return card;
      }));
    }
    for(const btn of buttons)btn.onclick=()=>{
      fillChoices(btn);
      dialog.showModal();
      choices.querySelector('[aria-pressed="true"]').focus({preventScroll:true});
    };
    refresh();
    document.getElementById("hangar").addEventListener("close",refresh);
    return {refresh};
  }
  return {create,regions};
})();
