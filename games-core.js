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
  const values=[...board];let count=0;
  function solve(){if(count>=limit)return;const i=values.indexOf(0);if(i<0){count++;return;}const row=Math.floor(i/4),col=i%4;
   for(let n=1;n<=4;n++){if(values.some((v,j)=>v===n&&(Math.floor(j/4)===row||j%4===col||Math.floor(j/8)===Math.floor(i/8)&&Math.floor(j%4/2)===Math.floor(col/2))))continue;values[i]=n;solve();values[i]=0;}
  }solve();return count;
 }
 function sudoku(random=Math.random){
  const digits=shuffle([1,2,3,4],random),rows=shuffle([0,1],random).flatMap(b=>shuffle([b*2,b*2+1],random)),cols=shuffle([0,1],random).flatMap(b=>shuffle([b*2,b*2+1],random));
  const solution=rows.flatMap(r=>cols.map(c=>digits[(r*2+Math.floor(r/2)+c)%4])),puzzle=[...solution];
  for(const index of shuffle([...puzzle.keys()],random)){const old=puzzle[index];puzzle[index]=0;if(sudokuCount(puzzle)!==1)puzzle[index]=old;if(puzzle.filter(v=>!v).length>=9)break;}
  return {solution,puzzle};
 }
 function mathQuestion(level=1,random=Math.random){const pick=n=>Math.floor(random()*n),op=pick(level===1?2:3);let a,b,answer,symbol;
  if(op===0){a=2+pick(level*15);b=2+pick(level*10);answer=a+b;symbol='+';}
  else if(op===1){b=2+pick(level*12);a=b+2+pick(level*12);answer=a-b;symbol='−';}
  else{a=2+pick(10);b=2+pick(10);answer=a*b;symbol='×';}
  const choices=new Set([answer]);for(const delta of shuffle([-10,-5,-3,-2,-1,1,2,3,5,10],random)){if(answer+delta>=0)choices.add(answer+delta);if(choices.size===4)break;}
  return {a,b,symbol,answer,choices:shuffle([...choices],random)};
 }
 return {shuffle,wordDeck,neighbors,slideBoard,sudoku,sudokuCount,mathQuestion};
});
