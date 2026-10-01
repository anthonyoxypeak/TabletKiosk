(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GameCore=factory();})(typeof window!=='undefined'?window:this,()=>{
 function shuffle(items,random=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
 function wordDeck(words,storage,random=Math.random){
  const key='oxypeak-word-deck-1.3',version=words.map(w=>w.word).join('|');let state;
  try{state=JSON.parse(storage?.getItem(key));}catch(_){}
  if(!state||state.version!==version||!Array.isArray(state.remaining)||state.remaining.length>words.length||new Set(state.remaining).size!==state.remaining.length||state.remaining.some(i=>!Number.isInteger(i)||i<0||i>=words.length))state={version,remaining:[],last:-1};
  return ()=>{
   if(!state.remaining.length){state.remaining=shuffle(words.map((_,i)=>i),random);if(state.remaining.length>1&&state.remaining.at(-1)===state.last)[state.remaining[0],state.remaining[state.remaining.length-1]]=[state.remaining.at(-1),state.remaining[0]];}
   const index=state.remaining.pop();state.last=index;try{storage?.setItem(key,JSON.stringify(state));}catch(_){}return words[index];
  };
 }
 function neighbors(index){return [index-4,index+4,...(index%4?[index-1]:[]),...(index%4<3?[index+1]:[])].filter(n=>n>=0&&n<16);}
 function slideBoard(random=Math.random){const values=Array.from({length:16},(_,i)=>(i+1)%16);let empty=15,previous=-1;for(let i=0;i<120;i++){const choices=neighbors(empty).filter(n=>n!==previous),next=choices[Math.floor(random()*choices.length)];[values[empty],values[next]]=[values[next],values[empty]];previous=empty;empty=next;}if(values.every((n,i)=>n===(i+1)%16))[values[14],values[15]]=[values[15],values[14]];return values;}
 function sudokuCount(board,limit=2){
  const n=Math.sqrt(board.length),box=Math.sqrt(n),values=[...board];if(!Number.isInteger(box))return 0;let count=0;
  function options(i){const row=Math.floor(i/n),col=i%n;const used=new Set(values.filter((v,j)=>v&&(Math.floor(j/n)===row||j%n===col||Math.floor(Math.floor(j/n)/box)===Math.floor(row/box)&&Math.floor(j%n/box)===Math.floor(col/box))));return Array.from({length:n},(_,k)=>k+1).filter(v=>!used.has(v));}
  for(let i=0;i<values.length;i++)if(values[i]){const v=values[i];values[i]=0;if(!options(i).includes(v))return 0;values[i]=v;}
  function solve(){if(count>=limit)return;let index=-1,candidates;
   for(let i=0;i<values.length;i++)if(!values[i]){const available=options(i);if(!available.length)return;if(!candidates||available.length<candidates.length){index=i;candidates=available;if(available.length===1)break;}}
   if(index<0){count++;return;}for(const n of candidates){values[index]=n;solve();values[index]=0;if(count>=limit)break;}
  }solve();return count;
 }
 function sudoku(random=Math.random,level='mini'){
  const size=level==='mini'?4:9,box=Math.sqrt(size),range=n=>Array.from({length:n},(_,i)=>i);
  const digits=shuffle(range(size).map(i=>i+1),random),order=()=>shuffle(range(box),random).flatMap(b=>shuffle(range(box).map(i=>b*box+i),random)),rows=order(),cols=order();
  const solution=rows.flatMap(r=>cols.map(c=>digits[(r*box+Math.floor(r/box)+c)%size])),puzzle=[...solution],clues=level==='mini'?7:level==='easy'?44:level==='hard'?28:36;
  for(const index of shuffle([...puzzle.keys()],random)){const old=puzzle[index];puzzle[index]=0;if(sudokuCount(puzzle)!==1)puzzle[index]=old;if(puzzle.filter(Boolean).length<=clues)break;}
  return {solution,puzzle,size,box};
 }
 function mathQuestion(level=1,random=Math.random){const pick=n=>Math.floor(random()*n),op=pick(level===1?2:3);let a,b,answer,symbol;
  if(op===0){a=2+pick(level*15);b=2+pick(level*10);answer=a+b;symbol='+';}
  else if(op===1){b=2+pick(level*12);a=b+2+pick(level*12);answer=a-b;symbol='−';}
  else{a=2+pick(10);b=2+pick(10);answer=a*b;symbol='×';}
  const choices=new Set([answer]);for(const delta of shuffle([-10,-5,-3,-2,-1,1,2,3,5,10],random)){if(answer+delta>=0)choices.add(answer+delta);if(choices.size===4)break;}
  return {a,b,symbol,answer,choices:shuffle([...choices],random)};
 }
    const pairThemes=[["Dr. Mo","🧑‍⚕️"],["HBOT","🫧"],["Oxygen","O₂"],["Hyperbaric","⬆️"],["Hypoxic","⬇️"],["Brain","🧠"],["Brain Gym","🧩"],["Longevity","🧬"],["Veterans","🎖️"],["Focus","🎯"],["Aging","⌛"],["Healthy Aging","🌱"],["Therapy","🤲"],["The Villages","🏡"],["Community","🤝"],["Life Span","∞"],["Chamber 1","①"],["Chamber 3","③"],["Chamber 4","④"],["Chamber 6","⑥"]].map(([name,icon])=>({name,icon}));
    function pairDeck(storage,random=Math.random){const key='oxypeak-pairs-1.7';let remaining=[];try{const saved=JSON.parse(storage?.getItem(key));if(Array.isArray(saved)&&new Set(saved).size===saved.length&&saved.every(i=>Number.isInteger(i)&&i>=0&&i<pairThemes.length))remaining=saved;}catch(_){}
        return ()=>{const picked=[];while(picked.length<8){if(!remaining.length){const fresh=shuffle(pairThemes.map((_,i)=>i),random);remaining=[...fresh.filter(i=>!picked.includes(i)),...fresh.filter(i=>picked.includes(i))];}picked.push(remaining.shift());}try{storage?.setItem(key,JSON.stringify(remaining));}catch(_){}return picked.map(i=>pairThemes[i]);};
    }
    function crossCells(index,size){return [index,...(index>=size?[index-size]:[]),...(index<size*(size-1)?[index+size]:[]),...(index%size?[index-1]:[]),...(index%size<size-1?[index+1]:[])];}
    function lightsPuzzle(size=4,random=Math.random){
        const cells=Array(size*size).fill(false),solution=shuffle(cells.map((_,i)=>i),random).slice(0,size+2);
        for(const i of solution)for(const j of crossCells(i,size))cells[j]=!cells[j];
        if(!cells.some(Boolean)){const existing=solution.indexOf(0);if(existing<0)solution.push(0);else solution.splice(existing,1);for(const j of crossCells(0,size))cells[j]=!cells[j];}
        return {cells,solution,size};
    }
    function lineCells(start,end,size){
        const r=Math.floor(start/size),c=start%size,dr=Math.floor(end/size)-r,dc=end%size-c;
        if(dr&&dc&&Math.abs(dr)!==Math.abs(dc))return [];
        return Array.from({length:Math.max(Math.abs(dr),Math.abs(dc))+1},(_,i)=>(r+i*Math.sign(dr))*size+c+i*Math.sign(dc));
    }
    function wordSearch(words,size=9,diagonal=false,random=Math.random){
        const cells=Array(size*size).fill(''),placed=[],directions=diagonal?[[0,1],[1,0],[1,1],[-1,1]]:[[0,1],[1,0]];
        for(const word of words){
            const candidates=[];
            for(let start=0;start<cells.length;start++)for(const [dr,dc] of directions){const r=Math.floor(start/size),c=start%size,er=r+dr*(word.length-1),ec=c+dc*(word.length-1);if(er<0||er>=size||ec<0||ec>=size)continue;
                const path=Array.from(word,(_,i)=>(r+dr*i)*size+c+dc*i);if(path.every((j,i)=>!cells[j]||cells[j]===word[i]))candidates.push(path);}
            if(!candidates.length)continue;
            const path=candidates[Math.floor(random()*candidates.length)];path.forEach((j,i)=>cells[j]=word[i]);placed.push({word,path});
        }
        return {size,cells:cells.map(c=>c||'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(random()*26)]),words:placed};
    }
    return {shuffle,wordDeck,neighbors,slideBoard,sudoku,sudokuCount,mathQuestion,pairDeck,pairThemes,crossCells,lightsPuzzle,lineCells,wordSearch};
});
