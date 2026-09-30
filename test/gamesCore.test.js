const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../games-core'),words=require('../game-words');
test('matching pairs use the exact 20 labels, exhaust each cycle and never duplicate a pair within a round',()=>{
 const expected=['Dr. Mo','HBOT','Oxygen','Hyperbaric','Hypoxic','Brain','Brain Gym','Longevity','Veterans','Focus','Aging','Healthy Aging','Therapy','The Villages','Community','Life Span','Chamber 1','Chamber 3','Chamber 4','Chamber 6'];
 assert.deepEqual(core.pairThemes.map(c=>c.name),expected);
 let saved;const storage={getItem:()=>saved,setItem:(k,v)=>saved=v};let next=core.pairDeck(storage);const names=[];
 for(let round=0;round<25;round++){if(round%3===2)next=core.pairDeck(storage);const cards=next();assert.equal(cards.length,8);assert.equal(new Set(cards.map(c=>c.name)).size,8);names.push(...cards.map(c=>c.name));}
 for(let i=0;i<names.length;i+=20)assert.equal(new Set(names.slice(i,i+20)).size,20);
 const broken=core.pairDeck({getItem:()=>'{bad json',setItem:()=>{throw Error('Unavailable');}});assert.equal(broken().length,8);
});
test('large curated word bank is unique and does not repeat across a complete saved cycle',()=>{
 assert.ok(words.length>2400);assert.equal(new Set(words.map(w=>w.word)).size,words.length);assert.ok(words.every(w=>/^[A-Z]{3,12}$/.test(w.word)&&w.category));
 let saved;const storage={getItem:()=>saved,setItem:(k,v)=>saved=v};let next=core.wordDeck(words,storage);const played=[];
 for(let i=0;i<words.length;i++){if(i===100)next=core.wordDeck(words,storage);played.push(next().word);}
 assert.equal(new Set(played).size,words.length);assert.notEqual(next().word,played.at(-1));
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};next=core.wordDeck(words,blocked);assert.notEqual(next().word,next().word);
 next=core.wordDeck(words,{getItem:()=>'{broken',setItem(){}});assert.ok(next().word);
});
test('generated Mini Sudoku puzzles have exactly one solution and valid rows, columns and boxes',()=>{
 for(let attempt=0;attempt<100;attempt++){
  const {solution,puzzle}=core.sudoku();assert.equal(core.sudokuCount(puzzle),1);assert.ok(puzzle.filter(v=>!v).length>=6);
  for(let r=0;r<4;r++){assert.equal(new Set(solution.slice(r*4,r*4+4)).size,4);assert.equal(new Set(solution.filter((_,i)=>i%4===r)).size,4);}
  for(const base of [0,2,8,10])assert.equal(new Set([base,base+1,base+4,base+5].map(i=>solution[i])).size,4);
  puzzle.forEach((v,i)=>{if(v)assert.equal(v,solution[i]);});
 }
});
test('number slides always begin unsolved and are reachable from the solved board',()=>{
 for(let attempt=0;attempt<100;attempt++){const board=core.slideBoard();assert.equal(new Set(board).size,16);assert.ok(board.some((v,i)=>v!==(i+1)%16));let inversions=0;
  board.forEach((v,i)=>{if(v)for(let j=i+1;j<16;j++)if(board[j]&&board[j]<v)inversions++;});
  assert.equal((inversions+4-Math.floor(board.indexOf(0)/4))%2,1);
 }
});
test('math rounds offer four distinct answers including the mathematically correct result',()=>{
 for(let level=1;level<=3;level++)for(let i=0;i<100;i++){const q=core.mathQuestion(level);assert.equal(q.choices.length,4);assert.equal(new Set(q.choices).size,4);assert.ok(q.choices.includes(q.answer));assert.ok(q.choices.every(n=>Number.isInteger(n)&&n>=0));assert.equal(q.answer,q.symbol==='+'?q.a+q.b:q.symbol==='−'?q.a-q.b:q.a*q.b);}
});

test('classic Sudoku difficulties generate unique 9 by 9 boards with progressively fewer clues',()=>{
 for(const level of ['easy','medium','hard'])for(let i=0;i<4;i++){const game=core.sudoku(Math.random,level);assert.equal(game.size,9);assert.equal(game.puzzle.length,81);assert.equal(core.sudokuCount(game.puzzle),1);const clues=game.puzzle.filter(Boolean).length;assert.ok(clues<=(level==='easy'?44:level==='medium'?38:33),level+': '+clues);for(let row=0;row<9;row++)assert.equal(new Set(game.solution.slice(row*9,row*9+9)).size,9);}
});
