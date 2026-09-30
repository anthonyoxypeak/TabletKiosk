(() => {
    const overview=document.getElementById('overview'),play=document.getElementById('play'),board=document.getElementById('board'),result=document.getElementById('result');
    let selected='',generation=0,lastWord=-1;
    const words=[['GARDEN','A place where flowers grow'],['PLANET','A world that orbits a star'],['BASKET','A container with a handle'],['PUZZLE','Something enjoyable to solve'],['ORANGE','A fruit and a color'],['STREAM','A small flowing body of water'],['SILVER','A shiny metal'],['WINDOW','A view through a wall'],['FOREST','A place with many trees'],['PICNIC','A meal enjoyed outdoors'],['CASTLE','A grand old building with towers'],['SUNSET','Color in the sky at the end of the day']];
    function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
    function button(label,action){const b=document.createElement('button');b.textContent=label;b.addEventListener('click',action);return b;}
    function message(type){if(window.parent!==window){window.parent.postMessage({type},location.origin);return true;}return false;}
    document.getElementById('home').onclick=()=>{if(!message('oxypeak-chart-close'))history.back();};
    document.getElementById('help').onclick=()=>{if(!message('oxypeak-help-open'))document.getElementById('offline').textContent='Use the Help button on the tablet homepage, or get staff attention directly.';};
    function start(game){selected=game;generation++;board.replaceChildren();result.textContent='';overview.hidden=true;play.hidden=false;
        const titles={pairs:'Matching Pairs',words:'Word Scramble',tiles:'Number Slide'};document.getElementById('game-title').textContent=titles[game];
        if(game==='pairs')pairs();if(game==='words')scramble();if(game==='tiles')tiles();
    }
    document.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>start(b.dataset.game));
    document.getElementById('all-games').onclick=()=>{generation++;play.hidden=true;overview.hidden=false;board.replaceChildren();};
    document.getElementById('new-game').onclick=()=>start(selected);
    function pairs(){document.getElementById('instructions').textContent='Choose two cards at a time. Find all eight pairs. There is no time limit.';
        const symbols=['Sun','Moon','Star','Tree','Wave','Leaf','Bird','Cloud'],deck=shuffle([...symbols,...symbols]);
        let opened=[],matched=0,locked=false;const gameGeneration=generation;
        const grid=document.createElement('div');grid.className='tile-grid';board.append(grid);
        deck.forEach((symbol,index)=>{const card=button('?',()=>{
            if(locked||card.disabled||opened.some(x=>x.card===card))return;
            card.textContent=symbol;card.setAttribute('aria-label',symbol);opened.push({card,symbol,index});
            if(opened.length!==2)return;
            if(opened[0].symbol===opened[1].symbol){opened.forEach(x=>{x.card.disabled=true;x.card.classList.add('matched');});opened=[];matched++;result.textContent=matched===8?'All pairs found! Nicely done.':`${matched} of 8 pairs found`;}
            else{locked=true;setTimeout(()=>{if(generation!==gameGeneration)return;opened.forEach(x=>{x.card.textContent='?';x.card.setAttribute('aria-label',`Card ${x.index+1}, face down`);});opened=[];locked=false;},1100);}
        });card.className='tile';card.style.fontSize='clamp(15px,2.5vw,25px)';card.setAttribute('aria-label',`Card ${index+1}, face down`);grid.append(card);});
    }
    function scramble(){document.getElementById('instructions').textContent='Unscramble the letters to find the word. Take your time.';
        let index;do{index=Math.floor(Math.random()*words.length);}while(index===lastWord);lastWord=index;
        const [answer,hint]=words[index];let mixed=shuffle(answer).join('');if(mixed===answer)mixed=answer.slice(1)+answer[0];
        const letters=document.createElement('div');letters.className='scramble';letters.textContent=mixed;board.append(letters);
        const form=document.createElement('form');form.className='word-form';const input=document.createElement('input');input.setAttribute('aria-label','Your word');input.autocomplete='off';input.spellcheck=false;input.maxLength=20;
        const check=button('Check word',()=>{});check.type='submit';form.append(input,check);form.onsubmit=e=>{e.preventDefault();result.textContent=input.value.trim().toUpperCase()===answer?'You got it! Choose New game for another word.':'Not quite. Try again, or use a hint.';};board.append(form);
        const controls=document.createElement('div');controls.className='word-form';controls.append(button('Hint',()=>{result.textContent=hint;}),button('Show answer',()=>{result.textContent=`The word is ${answer}.`;}));board.append(controls);
    }
    function tiles(){document.getElementById('instructions').textContent='Tap a tile beside the empty space to move it. Arrange 1–15 from left to right, top to bottom.';
        const values=Array.from({length:16},(_,i)=>(i+1)%16);let empty=15,moves=0;
        function neighbors(index){return [index-4,index+4,...(index%4?[index-1]:[]),...(index%4<3?[index+1]:[])].filter(n=>n>=0&&n<16);}
        for(let i=0;i<180;i++){const options=neighbors(empty);const next=options[Math.floor(Math.random()*options.length)];[values[empty],values[next]]=[values[next],values[empty]];empty=next;}
        if(values.every((v,i)=>v===(i+1)%16)){[values[14],values[15]]=[values[15],values[14]];empty=14;}
        const grid=document.createElement('div');grid.className='tile-grid';board.append(grid);
        function render(){grid.replaceChildren();values.forEach((v,i)=>{const tile=button(v?String(v):'Empty',()=>{if(!neighbors(empty).includes(i))return;[values[empty],values[i]]=[values[i],values[empty]];empty=i;moves++;render();result.textContent=values.every((n,j)=>n===(j+1)%16)?`Solved in ${moves} moves!`:`${moves} moves`;});tile.className=`tile${v?'':' blank'}`;tile.disabled=!v;grid.append(tile);});}
        render();
    }
    if('serviceWorker' in navigator){navigator.serviceWorker.register('offline-worker.js').then(()=>navigator.serviceWorker.ready).then(()=>{document.getElementById('offline').textContent='Matching Pairs, Word Scramble and Number Slide are ready offline. Wordle needs an internet connection.';}).catch(()=>{document.getElementById('offline').textContent='Games are ready to play here. Offline download is unavailable in this browser.';});}
    else document.getElementById('offline').textContent='Offline download is unavailable in this browser.';
})();
