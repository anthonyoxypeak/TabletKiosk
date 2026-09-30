(() => {
    const byId=id=>document.getElementById(id),overview=byId('overview'),play=byId('play'),board=byId('board'),result=byId('result'),score=byId('score');
    const C=GameCore;let storage;try{storage=localStorage;}catch(_){}
    const nextWord=C.wordDeck(GameWords,storage);let selected='',generation=0,opener=null,wordWins=0,mathLevel=1;const timers=new Set();
    const info={pairs:['Matching Pairs','Memory','Turn over two cards at a time. Find all eight pairs.'],words:['Word Scramble','Word power','Put the letters in order. A category and a hint can help.'],tiles:['Number Slide','Spatial thinking','Slide a neighboring tile into the space. Put 1–15 in order.'],sudoku:['Mini Sudoku','Logic','Use 1–4 once in each row, column and outlined 2 × 2 box.'],sequence:['Sequence Memory','Recall','Watch the highlighted shapes, then tap them in the same order.'],math:['Number Sense','Mental math','Ten little number challenges. Take all the time you need.'],focus:['Color Focus','Attention','Choose the color of the ink, rather than the word it spells.']};
    function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
    function button(text,action,cls=''){const b=element('button',text,cls);b.type='button';b.onclick=action;return b;}
    function chips(...texts){score.replaceChildren(...texts.map(text=>element('span',text,'chip')));}
    function clearTimers(){for(const timer of timers)clearTimeout(timer);timers.clear();}
    function later(action,ms){const current=generation,timer=setTimeout(()=>{timers.delete(timer);if(current===generation)action();},ms);timers.add(timer);}
    function delay(ms){return new Promise(resolve=>later(resolve,ms));}
    function say(text){result.textContent=text;}
    function controls(...buttons){const row=element('div',undefined,'controls');row.append(...buttons);return row;}
    function start(game){clearTimers();generation++;selected=game;board.replaceChildren();score.replaceChildren();say('');overview.hidden=true;play.hidden=false;
        const [title,category,instructions]=info[game];byId('game-title').textContent=title;byId('game-category').textContent=category;byId('instructions').textContent=instructions;
        ({pairs,words:scramble,tiles,sudoku,sequence,math,focus:colorFocus})[game]();byId('game-title').focus();
    }
    document.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>{opener=b;start(b.dataset.game);});
    byId('all-games').onclick=()=>{clearTimers();generation++;play.hidden=true;overview.hidden=false;board.replaceChildren();opener?.focus();};
    byId('new-game').onclick=()=>start(selected);
    byId('home').onclick=()=>{if(parent!==window)parent.postMessage({type:'oxypeak-chart-close'},location.origin);else if(history.length>1)history.back();else location.href='seat.html';};
    function pairs(){
        const symbols=C.shuffle(['Sun','Moon','Star','Tree','Wave','Leaf','Bird','Cloud','Rose','Fish','Bell','Kite','Pear','Boat','Key','Gem']).slice(0,8),deck=C.shuffle([...symbols,...symbols]);
        let opened=[],matched=0,locked=false,moves=0;chips('0 of 8 pairs','0 turns');const grid=element('div',undefined,'tile-grid');board.append(grid);
        deck.forEach((symbol,index)=>{const card=button('◇',()=>{
            if(locked||card.disabled||opened.some(x=>x.card===card))return;
            card.textContent=symbol;card.classList.add('revealed');card.setAttribute('aria-label',symbol);opened.push({card,symbol,index});if(opened.length!==2)return;moves++;
            if(opened[0].symbol===opened[1].symbol){opened.forEach(x=>{x.card.disabled=true;x.card.classList.add('matched');});opened=[];matched++;say(matched===8?'All pairs found! A lovely bit of remembering.':'A match! Keep going.');}
            else{locked=true;later(()=>{opened.forEach(x=>{x.card.textContent='◇';x.card.classList.remove('revealed');x.card.setAttribute('aria-label','Card '+(x.index+1)+', face down');});opened=[];locked=false;},1100);}
            chips(matched+' of 8 pairs',moves+' turns');
        },'tile pair-card');card.setAttribute('aria-label','Card '+(index+1)+', face down');grid.append(card);});
    }
    function scramble(){
        const entry=nextWord(),answer=entry.word;let mixed=C.shuffle(answer).join('');if(mixed===answer)mixed=answer.slice(1)+answer[0];let won=false;
        chips(GameWords.length.toLocaleString()+' words',wordWins+' solved');board.append(element('p',entry.category,'hint'));
        const letters=element('div',undefined,'scramble');for(const letter of mixed)letters.append(element('span',letter,'letter'));board.append(letters);
        const form=element('form',undefined,'word-form'),input=element('input');input.setAttribute('aria-label','Your word');input.autocomplete='off';input.spellcheck=false;input.maxLength=answer.length;input.autocapitalize='characters';
        const check=button('Check word',()=>{},'primary');check.type='submit';form.append(input,check);form.onsubmit=e=>{e.preventDefault();if(won)return;if(input.value.trim().toUpperCase()===answer){won=true;wordWins++;chips(GameWords.length.toLocaleString()+' words',wordWins+' solved');say('You got it! Ready for another?');check.disabled=true;input.disabled=true;next.hidden=false;next.focus();}else say('Not quite. Try rearranging the letters, or ask for a hint.');};board.append(form);
        let hints=0;const hint=button('Hint',()=>{hints=Math.min(answer.length-1,hints+1);say('Starts with '+answer.slice(0,hints)+' · '+answer.length+' letters.');});
        const reveal=button('Reveal word',()=>{if(won)return;say('The word is '+answer+'. Try a fresh word when you’re ready.');check.disabled=true;input.disabled=true;hint.disabled=true;reveal.disabled=true;next.hidden=false;});
        board.append(controls(hint,button('Mix letters',()=>{const lettersNew=C.shuffle(mixed);letters.replaceChildren(...lettersNew.map(l=>element('span',l,'letter')));}),reveal));
        const next=button('Next word →',()=>start('words'),'primary next');next.hidden=true;board.append(next);
    }
    function tiles(){const values=C.slideBoard();let empty=values.indexOf(0),moves=0,won=false;const grid=element('div',undefined,'tile-grid');board.append(grid);chips('Arrange 1–15','0 moves');
        function render(focusValue){grid.replaceChildren();values.forEach((value,index)=>{const tile=button(value?String(value):'Empty',()=>{if(won||!C.neighbors(empty).includes(index))return;[values[empty],values[index]]=[values[index],values[empty]];empty=index;moves++;won=values.every((n,j)=>n===(j+1)%16);render(value);chips('Arrange 1–15',moves+' moves');if(won)say('Perfect order! Solved in '+moves+' moves.');},'tile'+(value?'':' blank'));tile.disabled=!value||won;tile.setAttribute('aria-label',value?'Tile '+value:'Empty space');grid.append(tile);if(value===focusValue&&!won)tile.focus();});}render();
    }
    function sudoku(){const {puzzle,solution}=C.sudoku(),values=[...puzzle];let selectedCell=-1,won=false;chips('4 × 4 grid','One solution');const layout=element('div',undefined,'sudoku-layout'),grid=element('div',undefined,'sudoku-grid'),pad=element('div',undefined,'number-pad'),cells=[];
        function render(){cells.forEach((cell,i)=>{cell.textContent=values[i]||'·';cell.classList.toggle('selected',i===selectedCell);cell.setAttribute('aria-label','Row '+(Math.floor(i/4)+1)+', column '+(i%4+1)+', '+(values[i]||'empty'));});}
        function put(n){if(selectedCell<0||won){say('Choose an empty square first.');return;}values[selectedCell]=n;cells[selectedCell].classList.remove('wrong');render();if(values.every((v,i)=>v===solution[i])){won=true;say('Beautifully solved! Every row, column and box is complete.');cells.forEach(c=>c.disabled=true);pad.querySelectorAll('button').forEach(b=>b.disabled=true);}}
        puzzle.forEach((v,i)=>{const cell=button(v||'·',()=>{selectedCell=i;render();say('Choose a number below.');},'sudoku-cell');cell.disabled=Boolean(v);cell.onkeydown=e=>{if(/^[1-4]$/.test(e.key)){e.preventDefault();selectedCell=i;put(Number(e.key));}if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();selectedCell=i;put(0);}};cells.push(cell);grid.append(cell);});
        for(let n=1;n<=4;n++)pad.append(button(String(n),()=>put(n)));pad.append(button('Erase',()=>put(0),'erase'));layout.append(grid,pad);board.append(layout);render();
        board.append(controls(button('Check grid',()=>{let wrong=0;cells.forEach((c,i)=>{const invalid=values[i]!==0&&values[i]!==solution[i];c.classList.toggle('wrong',invalid);if(invalid)wrong++;});say(wrong?'Highlighted squares need another look.':'Looking good. Keep going!');})));
    }
    function sequence(){
        const names=['Circle','Diamond','Triangle','Square'],shapes=['●','◆','▲','■'];let pattern=[Math.floor(Math.random()*4),Math.floor(Math.random()*4)],position=0,accepting=false,playing=false,best=0;
        const grid=element('div',undefined,'memory-grid'),pads=[];const playButton=button('Start pattern',playPattern,'primary'),replay=button('Replay pattern',playPattern);replay.hidden=true;
        chips('Level 1','2 steps');names.forEach((name,i)=>{const pad=button('',()=>{
            if(!accepting)return;pad.classList.add('lit');later(()=>pad.classList.remove('lit'),180);
            if(i!==pattern[position]){accepting=false;pads.forEach(p=>p.disabled=true);say('Almost! Watch the same pattern and try again.');playButton.textContent='Try again';playButton.hidden=false;replay.hidden=true;return;}
            position++;if(position===pattern.length){accepting=false;best=Math.max(best,pattern.length);pads.forEach(p=>p.disabled=true);say('You remembered all '+pattern.length+' steps!');playButton.textContent='Next round →';playButton.onclick=()=>{pattern.push(Math.floor(Math.random()*4));playPattern();};playButton.hidden=false;replay.hidden=true;chips('Level '+(pattern.length-1),'Best: '+best+' steps');}else say(position+' of '+pattern.length+' steps');
        },'memory-pad');pad.append(element('span',shapes[i]),element('small',name));pad.setAttribute('aria-label',name);pad.disabled=true;pads.push(pad);grid.append(pad);});board.append(grid,controls(playButton,replay));
        async function playPattern(){if(playing)return;playing=true;accepting=false;position=0;const current=generation;playButton.hidden=true;playButton.onclick=playPattern;replay.hidden=true;pads.forEach(p=>{p.disabled=true;p.classList.remove('lit');});say('Watch the pattern…');chips('Level '+(pattern.length-1),pattern.length+' steps');await delay(350);
            for(const index of pattern){if(current!==generation)return;pads[index].classList.add('lit');await delay(650);pads[index].classList.remove('lit');await delay(220);}
            if(current!==generation)return;playing=false;accepting=true;pads.forEach(p=>p.disabled=false);replay.hidden=false;say('Your turn. Repeat the pattern.');
        }
    }
    function quizRound(kind){let round=0,correct=0;const seen=new Set();
        function next(){board.replaceChildren();say('');if(round===10){chips('10 rounds complete',correct+' correct');board.append(element('div',correct+' / 10','celebrate'),element('p',correct===10?'A perfect round. Nicely focused!':'Nice work. Every round is a fresh challenge.','hint'),button('Play another round',()=>start(kind),'primary next'));return;}
            round++;chips('Round '+round+' of 10',correct+' correct');const dots=element('div',undefined,'dots');for(let i=0;i<10;i++)dots.append(element('span',undefined,'dot'+(i<round?' done':'')));board.append(dots);
            let question,answer,choices;
            if(kind==='math'){let q;for(let tries=0;tries<25;tries++){q=C.mathQuestion(mathLevel);const key=q.a+q.symbol+q.b;if(!seen.has(key)){seen.add(key);break;}}question=element('div',q.a+' '+q.symbol+' '+q.b+' = ?','question');answer=q.answer;choices=q.choices;}
            else{const colors=[['Blue','#215db4'],['Green','#207346'],['Red','#be3943'],['Purple','#8045a4']],ink=Math.floor(Math.random()*4),word=(ink+1+Math.floor(Math.random()*3))%4;question=element('div',colors[word][0].toUpperCase(),'question');question.style.color=colors[ink][1];answer=colors[ink][0];choices=C.shuffle(colors.map(c=>c[0]));}
            board.append(question);const answers=element('div',undefined,'answers'),buttons=[];let answered=false;const nextButton=button(round===10?'See results →':'Next challenge →',next,'primary next');nextButton.hidden=true;
            choices.forEach(value=>{const b=button(String(value),()=>{if(answered)return;answered=true;if(value===answer){correct++;say('That’s right!');}else say('The answer is '+answer+'. On to the next one.');buttons.forEach(({button,choice})=>{button.disabled=true;button.classList.toggle('correct',choice===answer);button.classList.toggle('incorrect',choice===value&&value!==answer);});chips('Round '+round+' of 10',correct+' correct');nextButton.hidden=false;nextButton.focus();});buttons.push({button:b,choice:value});answers.append(b);});board.append(answers,nextButton);
        }next();
    }
    function math(){chips('Choose your pace');board.append(element('p','Which challenge feels right today?','hint'),controls(...[['Gentle',1],['Balanced',2],['Stretch',3]].map(([label,level])=>button(label,()=>{mathLevel=level;quizRound('math');},level===mathLevel?'primary':''))));}
    function colorFocus(){quizRound('focus');}
    if('serviceWorker' in navigator)navigator.serviceWorker.register('offline-worker.js').catch(()=>{});
})();
