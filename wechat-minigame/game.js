// ============================================================
//  弈 · 棋道 — 微信小游戏版
//  从单文件 HTML 移植，完整保留全部 AI 逻辑
//  (五子棋 PVS/VCF/VCT  围棋 MCTS+RAVE  象棋 PVS+置换表)
// ============================================================

// ---------- 微信小游戏环境适配 ----------
var sysInfo = wx.getSystemInfoSync();
var SW = sysInfo.screenWidth;
var SH = sysInfo.screenHeight;
var DPR = sysInfo.pixelRatio || 1;

// 主画布（首次 createCanvas 返回屏幕显示画布）
var mainCanvas = wx.createCanvas();
mainCanvas.width = Math.round(SW * DPR);
mainCanvas.height = Math.round(SH * DPR);
var mainCtx = mainCanvas.getContext('2d');
mainCtx.scale(DPR, DPR);

// 棋盘离屏画布（对应原 HTML 的 #bd canvas，供 drawGomoku/drawGo/drawXQ 使用）
var cv = wx.createCanvas();
var cx = cv.getContext('2d');

// 存储适配 (localStorage -> wx.getStorageSync / setStorageSync)
function lsGet(k){ try{ return wx.getStorageSync(k) }catch(e){ return '' } }
function lsSet(k,v){ try{ wx.setStorageSync(k, v) }catch(e){} }
function createOffCanvas(w,h){ var c=wx.createCanvas(); c.width=w; c.height=h; return c }

// 字体族（系统默认中文字体，不使用 Google Fonts）
var FF = '"PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
var FF_SERIF = '"Songti SC","STSong","SimSun","宋体",serif';
var COL = {
  ink:'#1c1917', inkS:'#44403c', inkL:'#78716c',
  paper:'#f5f0e6', paperW:'#ebe3d2', paperD:'#d9cdb4',
  accent:'#8b5e3c', accentS:'#a47b5a',
  red:'#9a4444', green:'#5a7a52', gold:'#c9a84c'
};
if(!String.prototype.padStart){
  String.prototype.padStart = function(n,c){ c=c||' '; var s=String(this); while(s.length<n) s=c+s; return s }
}

// ---------- 全局状态 ----------
var curGame='gomoku', over=false, curDiff=2, playerFirst=true;
var replayMode=false, replayData=null, replayStep=0, replayTimer=null;
var stats=(function(){try{return JSON.parse(lsGet('gmk_s')||'')}catch(e){}})()||{w:0,l:0,d:0};
function saveS(){lsSet('gmk_s',JSON.stringify(stats))}
function addS(r){if(r==='w')stats.w++;else if(r==='l')stats.l++;else stats.d++;saveS()}

var STATE_MENU='menu',STATE_GAME='game',STATE_RPLIST='rplist',STATE_RPVIEW='rpview';
var appState=STATE_MENU;

var titleText='五子棋', footerText='黑先 · 连五为胜';
var p1Text='你', p2Text='电脑';
var statusText='你的回合', statusColor=COL.accent;
var thinking=false, aiInfoText='', winRatePct=50, winRateVisible=false;
var overTitle='', overText='', overClass='';
var moveListText='', checkText='';
var L={};
var hitRegions=[];
function addRegion(x,y,w,h,action,data){hitRegions.push({x:x,y:y,w:w,h:h,action:action,data:data||{}})}
function clearRegions(){hitRegions.length=0}
var needRender=true, frame=0;
function requestRender(){needRender=true}

// ---------- 通用绘制 ----------
function roundRect(ctx,x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  ctx.beginPath();ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}
function setText(ctx,font,color,align,baseline){
  ctx.font=font;ctx.fillStyle=color;ctx.textAlign=align||'left';ctx.textBaseline=baseline||'alphabetic';
}
function wrapText(ctx,text,x,y,maxW,lineH,maxLines){
  var chars=text.split(''),line='',lines=[],i=0;
  while(i<chars.length&&lines.length<maxLines){
    var test=line+chars[i];
    if(ctx.measureText(test).width>maxW&&line){lines.push(line);line=chars[i]}
    else{line=test}
    i++;
  }
  if(lines.length<maxLines)lines.push(line);
  else if(line)lines[lines.length-1]+='…';
  for(var j=0;j<lines.length;j++)ctx.fillText(lines[j],x,y+j*lineH);
  return lines.length*lineH;
}
function drawButton(x,y,w,h,label,opts){
  opts=opts||{};
  var r=Math.min(8,h/2);
  if(opts.active)mainCtx.fillStyle=COL.accent;
  else if(opts.disabled)mainCtx.fillStyle='#e0d6c2';
  else if(opts.dark)mainCtx.fillStyle=COL.ink;
  else mainCtx.fillStyle=COL.paperW;
  roundRect(mainCtx,x,y,w,h,r);mainCtx.fill();
  mainCtx.strokeStyle=opts.active?COL.accent:(opts.dark?COL.ink:COL.paperD);
  mainCtx.lineWidth=1;mainCtx.stroke();
  var fc=opts.active?COL.paper:(opts.disabled?COL.inkL:(opts.dark?COL.paper:COL.inkS));
  setText(mainCtx,(opts.bold?'600 ':'')+(opts.fontSize||13)+'px '+FF,fc,'center','middle');
  mainCtx.fillText(label,x+w/2,y+h/2);
}

// ---------- 棋子球体 / 木纹纹理 (与原文件一致) ----------
function drawBall(px,py,r,black){
  r=Math.max(2,r);
  cx.save();
  cx.shadowColor='rgba(0,0,0,.4)';cx.shadowBlur=r*.5;cx.shadowOffsetX=r*.1;cx.shadowOffsetY=r*.2;
  var g=cx.createRadialGradient(px-r*.4,py-r*.4,r*.03,px+r*.15,py+r*.15,r*1.15);
  if(black){g.addColorStop(0,'#7a7a7a');g.addColorStop(.1,'#4a4a4a');g.addColorStop(.3,'#2a2a2a');g.addColorStop(.6,'#121212');g.addColorStop(.9,'#080808');g.addColorStop(1,'#020202')}
  else{g.addColorStop(0,'#ffffff');g.addColorStop(.15,'#fcf8f0');g.addColorStop(.4,'#f5ede0');g.addColorStop(.7,'#e8dcc8');g.addColorStop(.9,'#d0c0a0');g.addColorStop(1,'#b8a888')}
  cx.fillStyle=g;cx.beginPath();cx.arc(px,py,r,0,Math.PI*2);cx.fill();cx.restore();
  cx.save();
  var hg=cx.createRadialGradient(px-r*.32,py-r*.32,0,px-r*.32,py-r*.32,r*.65);
  if(black){hg.addColorStop(0,'rgba(255,255,255,.22)');hg.addColorStop(.5,'rgba(255,255,255,.05)');hg.addColorStop(1,'rgba(255,255,255,0)')}
  else{hg.addColorStop(0,'rgba(255,255,255,.85)');hg.addColorStop(.4,'rgba(255,255,255,.3)');hg.addColorStop(1,'rgba(255,255,255,0)')}
  cx.fillStyle=hg;cx.beginPath();cx.arc(px,py,r,0,Math.PI*2);cx.fill();cx.restore();
  cx.save();
  var sg=cx.createRadialGradient(px-r*.3,py-r*.3,0,px-r*.3,py-r*.3,r*.3);
  if(black){sg.addColorStop(0,'rgba(255,255,255,.2)');sg.addColorStop(1,'rgba(255,255,255,0)')}
  else{sg.addColorStop(0,'rgba(255,255,255,.95)');sg.addColorStop(1,'rgba(255,255,255,0)')}
  cx.fillStyle=sg;cx.beginPath();cx.ellipse(px-r*.28,py-r*.28,r*.25,r*.2,-0.3,0,Math.PI*2);cx.fill();cx.restore();
  cx.save();cx.globalAlpha=black?.12:.2;
  var bg=cx.createRadialGradient(px+r*.2,py+r*.3,0,px+r*.2,py+r*.3,r*.5);
  if(black){bg.addColorStop(0,'rgba(100,100,100,.5)');bg.addColorStop(1,'rgba(0,0,0,0)')}
  else{bg.addColorStop(0,'rgba(200,180,150,.5)');bg.addColorStop(1,'rgba(255,255,255,0)')}
  cx.fillStyle=bg;cx.beginPath();cx.arc(px,py,r,0,Math.PI*2);cx.fill();cx.restore();
  cx.save();cx.globalAlpha=black?.4:.2;cx.strokeStyle=black?'#000':'#a89878';cx.lineWidth=1;
  cx.beginPath();cx.arc(px,py,r-.5,0,Math.PI*2);cx.stroke();cx.restore();
}
var _paperCache={};
function makeWoodTexture(w,h,seed){
  var key=w+'_'+h;
  if(_paperCache[key])return _paperCache[key];
  var oc=createOffCanvas(w,h);
  var ox=oc.getContext('2d');
  var s=seed||12345;
  function rng(){s=(s*9301+49297)%233280;return s/233280}
  var g=ox.createRadialGradient(w/2,h/2,0,w/2,h/2,w*.72);
  g.addColorStop(0,'#e8cc94');g.addColorStop(.35,'#dab87a');g.addColorStop(.7,'#c8a460');g.addColorStop(1,'#a8843c');
  ox.fillStyle=g;ox.fillRect(0,0,w,h);
  ox.save();ox.globalAlpha=.14;
  for(var i=0;i<35;i++){
    ox.strokeStyle=i%2===0?'#8b5e3c':'#6b4226';ox.lineWidth=.5+rng()*1.2;
    ox.beginPath();var y=(i/35)*h+rng()*8;
    ox.moveTo(0,y);ox.bezierCurveTo(w*.25,y+(rng()-.5)*20,w*.5,y+(rng()-.5)*20,w*.75,y+(rng()-.5)*15);
    ox.bezierCurveTo(w*.85,y+(rng()-.5)*12,w*.95,y+(rng()-.5)*8,w,y+(rng()-.5)*5);ox.stroke();
  }
  ox.restore();ox.save();ox.globalAlpha=.08;
  for(var i=0;i<20;i++){
    ox.strokeStyle='#5a3a1a';ox.lineWidth=.3+rng()*.4;
    ox.beginPath();var y=rng()*h;
    ox.moveTo(0,y);ox.bezierCurveTo(w*.3,y+(rng()-.5)*12,w*.6,y+(rng()-.5)*12,w,y+(rng()-.5)*8);ox.stroke();
  }
  ox.restore();ox.save();ox.globalAlpha=.06;
  for(var i=0;i<120;i++){ox.fillStyle=i%3===0?'#8b6914':'#6b4f10';ox.fillRect(rng()*w,rng()*h,rng()*2+.3,rng()*2+.3)}
  ox.restore();ox.save();ox.globalAlpha=.15;
  var vg=ox.createRadialGradient(w/2,h/2,w*.25,w/2,h/2,w*.7);
  vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(50,30,5,.7)');
  ox.fillStyle=vg;ox.fillRect(0,0,w,h);ox.restore();
  _paperCache[key]=oc;return oc;
}
function drawPaper(w,h){cx.drawImage(makeWoodTexture(w,h),0,0)}

// ============================================================
//  五子棋 — VCF/VCT 威胁搜索 + 迭代加深 PVS + 26开局定式
// ============================================================
var GS=15,GC=36,GP=28,GR=15,GX=GC*(GS-1)+GP*2;
var gB,gH,gCur,gAiThink,gLast,gTT,gNodes,gStart,gAbort,gTTSize=200003,gKiller,gHistory;
var PAT_SCORE={FIVE:10000000,LIVE_FOUR:1000000,RUSH_FOUR:100000,LIVE_THREE:10000,SLEEP_THREE:1000,LIVE_TWO:100,SLEEP_TWO:10,LIVE_ONE:1,SLEEP_ONE:0};
function gLineStr(b,x,y,p,dx,dy){
  var s='';
  for(var i=-4;i<=4;i++){
    var nx=x+dx*i,ny=y+dy*i;
    if(i===0){s+='1';continue}
    if(nx<0||nx>=GS||ny<0||ny>=GS){s+='2';continue}
    var v=b[ny][nx];
    if(v===0)s+='0';else if(v===p)s+='1';else s+='2';
  }
  return s;
}
function gPattern(s){
  if(s.indexOf('11111')>=0)return'FIVE';
  if(s.indexOf('011110')>=0)return'LIVE_FOUR';
  if(/[2]11110/.test(s)||/01111[2]/.test(s))return'RUSH_FOUR';
  if(s.indexOf('11011')>=0||s.indexOf('11101')>=0||s.indexOf('10111')>=0)return'RUSH_FOUR';
  if(/^[2]1111/.test(s)||/1111[2]$/.test(s))return'RUSH_FOUR';
  if(s.indexOf('011100')>=0||s.indexOf('001110')>=0)return'LIVE_THREE';
  if(s.indexOf('010110')>=0||s.indexOf('011010')>=0)return'LIVE_THREE';
  if(/[2]11100/.test(s)||/00111[2]/.test(s))return'SLEEP_THREE';
  if(/[2]10110/.test(s)||/01101[2]/.test(s))return'SLEEP_THREE';
  if(/[2]11010/.test(s)||/01011[2]/.test(s))return'SLEEP_THREE';
  if(s.indexOf('10011')>=0||s.indexOf('11001')>=0||s.indexOf('10101')>=0)return'SLEEP_THREE';
  if(/^[2]1110/.test(s)||/0111[2]$/.test(s))return'SLEEP_THREE';
  if(s.indexOf('001100')>=0||s.indexOf('010100')>=0)return'LIVE_TWO';
  if(s.indexOf('001010')>=0||s.indexOf('010010')>=0)return'LIVE_TWO';
  if(/[2]01100/.test(s)||/00110[2]/.test(s))return'SLEEP_TWO';
  if(/[2]10100/.test(s)||/00101[2]/.test(s))return'SLEEP_TWO';
  if(s.indexOf('10001')>=0)return'SLEEP_TWO';
  if(s.indexOf('00100')>=0||s.indexOf('01000')>=0||s.indexOf('00010')>=0)return'LIVE_ONE';
  return null;
}
function gEvalPt(b,x,y,p){
  var D=[[1,0],[0,1],[1,1],[1,-1]],total=0;
  var patterns={FIVE:0,LIVE_FOUR:0,RUSH_FOUR:0,LIVE_THREE:0,SLEEP_THREE:0,LIVE_TWO:0,SLEEP_TWO:0,LIVE_ONE:0};
  for(var d=0;d<4;d++){var pat=gPattern(gLineStr(b,x,y,p,D[d][0],D[d][1]));if(pat){patterns[pat]++;total+=PAT_SCORE[pat]}}
  if(patterns.FIVE>0)return PAT_SCORE.FIVE;
  if(patterns.LIVE_FOUR>0||patterns.RUSH_FOUR>=2)return PAT_SCORE.LIVE_FOUR;
  if(patterns.RUSH_FOUR>0&&patterns.LIVE_THREE>0)return PAT_SCORE.RUSH_FOUR;
  if(patterns.LIVE_THREE>=2)return PAT_SCORE.LIVE_THREE*2;
  return total;
}
function gPatCount(b,x,y,p){
  var D=[[1,0],[0,1],[1,1],[1,-1]];
  var pc={FIVE:0,LIVE_FOUR:0,RUSH_FOUR:0,LIVE_THREE:0,SLEEP_THREE:0,LIVE_TWO:0,SLEEP_TWO:0};
  for(var d=0;d<4;d++){var pat=gPattern(gLineStr(b,x,y,p,D[d][0],D[d][1]));if(pat&&pc[pat]!==undefined)pc[pat]++}
  return pc;
}
function gCands(b,range){
  range=range||2;var s=new Set();
  for(var y=0;y<GS;y++)for(var x=0;x<GS;x++)if(b[y][x]!==0)
    for(var dy=-range;dy<=range;dy++)for(var dx=-range;dx<=range;dx++){var nx=x+dx,ny=y+dy;if(nx>=0&&nx<GS&&ny>=0&&ny<GS&&b[ny][nx]===0)s.add(ny*GS+nx)}
  if(s.size===0)s.add(7*GS+7);
  var arr=[];s.forEach(function(v){arr.push({x:v%GS,y:Math.floor(v/GS)})});
  return arr;
}
function gCheckWin(b,x,y,p){
  var D=[[1,0],[0,1],[1,1],[1,-1]];
  for(var d=0;d<4;d++){
    var c=1;
    for(var i=1;i<5;i++){var nx=x+D[d][0]*i,ny=y+D[d][1]*i;if(nx<0||nx>=GS||ny<0||ny>=GS||b[ny][nx]!==p)break;c++}
    for(var i=1;i<5;i++){var nx=x-D[d][0]*i,ny=y-D[d][1]*i;if(nx<0||nx>=GS||ny<0||ny>=GS||b[ny][nx]!==p)break;c++}
    if(c>=5)return true;
  }
  return false;
}
var gZob=new Array(GS*GS*2);
for(var i=0;i<gZob.length;i++)gZob[i]=Math.random()*0xFFFFFFFF;
function gHash(b){var h=0;for(var y=0;y<GS;y++)for(var x=0;x<GS;x++){if(b[y][x]===1)h^=gZob[(y*GS+x)*2];else if(b[y][x]===2)h^=gZob[(y*GS+x)*2+1]}return h>>>0}
function gVCF(b,attacker,depth,koHash){
  if(depth<=0||gAbort)return null;
  var cs=gCands(b,1);
  cs.sort(function(a,c){return gEvalPt(b,c.x,c.y,attacker)-gEvalPt(b,a.x,a.y,attacker)});
  for(var i=0;i<cs.length;i++){
    var x=cs[i].x,y=cs[i].y;
    var pc=gPatCount(b,x,y,attacker);
    if(pc.RUSH_FOUR===0&&pc.LIVE_FOUR===0&&pc.FIVE===0)continue;
    b[y][x]=attacker;
    if(gCheckWin(b,x,y,attacker)){b[y][x]=0;return{x:x,y:y}}
    var opp=3-attacker;
    var defMove=gFindDefend(b,attacker);
    if(defMove){
      b[defMove.y][defMove.x]=opp;
      if(!gCheckWin(b,defMove.x,defMove.y,opp)){
        var r=gVCF(b,attacker,depth-1);
        if(r){b[defMove.y][defMove.x]=0;b[y][x]=0;return{x:x,y:y}}
      }
      b[defMove.y][defMove.x]=0;
    }
    b[y][x]=0;if(gAbort)break;
  }
  return null;
}
function gFindDefend(b,attacker){
  var opp=3-attacker;var cs=gCands(b,1);
  for(var i=0;i<cs.length;i++){
    var x=cs[i].x,y=cs[i].y;if(b[y][x]!==0)continue;
    b[y][x]=opp;var stillThreat=false;var acs=gCands(b,1);
    for(var j=0;j<acs.length;j++){
      if(b[acs[j].y][acs[j].x]!==0)continue;
      var pc=gPatCount(b,acs[j].x,acs[j].y,attacker);
      if(pc.FIVE>0||pc.LIVE_FOUR>0||pc.RUSH_FOUR>0){stillThreat=true;break}
    }
    b[y][x]=0;if(!stillThreat)return{x:x,y:y};
  }
  return null;
}
function gVCT(b,attacker,depth){
  if(depth<=0||gAbort)return null;
  var cs=gCands(b,1);
  cs.sort(function(a,c){return gEvalPt(b,c.x,c.y,attacker)-gEvalPt(b,a.x,a.y,attacker)});
  for(var i=0;i<cs.length;i++){
    var x=cs[i].x,y=cs[i].y;
    var pc=gPatCount(b,x,y,attacker);
    if(pc.LIVE_THREE===0&&pc.RUSH_FOUR===0&&pc.LIVE_FOUR===0&&pc.FIVE===0)continue;
    b[y][x]=attacker;
    if(gCheckWin(b,x,y,attacker)){b[y][x]=0;return{x:x,y:y}}
    var apc=gPatCount(b,x,y,attacker);
    if(apc.LIVE_FOUR>0||apc.RUSH_FOUR>=2||(apc.RUSH_FOUR>0&&apc.LIVE_THREE>0)||apc.LIVE_THREE>=2){
      var opp=3-attacker;var defs=gDefendMoves(b,attacker);
      if(defs.length===0){b[y][x]=0;return{x:x,y:y}}
      var allWin=true;
      for(var j=0;j<defs.length;j++){
        b[defs[j].y][defs[j].x]=opp;
        if(gCheckWin(b,defs[j].x,defs[j].y,opp)){b[defs[j].y][defs[j].x]=0;allWin=false;break}
        var r=gVCT(b,attacker,depth-1);
        b[defs[j].y][defs[j].x]=0;if(!r){allWin=false;break}
      }
      if(allWin){b[y][x]=0;return{x:x,y:y}}
    }
    b[y][x]=0;if(gAbort)break;
  }
  return null;
}
function gDefendMoves(b,attacker){
  var opp=3-attacker;var cs=gCands(b,1);var defs=[];
  for(var i=0;i<cs.length;i++){
    var x=cs[i].x,y=cs[i].y;if(b[y][x]!==0)continue;
    b[y][x]=opp;var stillThreat=false;var acs=gCands(b,1);
    for(var j=0;j<acs.length;j++){
      if(b[acs[j].y][acs[j].x]!==0)continue;
      var pc=gPatCount(b,acs[j].x,acs[j].y,attacker);
      if(pc.FIVE>0||pc.LIVE_FOUR>0||pc.RUSH_FOUR>0||pc.LIVE_THREE>0){stillThreat=true;break}
    }
    b[y][x]=0;if(!stillThreat)defs.push({x:x,y:y});
  }
  return defs;
}
function gEvalBoard(aiP,huP){
  var ai=0,hu=0;
  for(var y=0;y<GS;y++)for(var x=0;x<GS;x++){
    if(gB[y][x]===aiP)ai+=gEvalPt(gB,x,y,aiP);
    else if(gB[y][x]===huP)hu+=gEvalPt(gB,x,y,huP);
  }
  return ai-hu*(curDiff>=4?1.2:1.08);
}
function gAlphaBeta(b,depth,alpha,beta,maxP,aiP,huP,ply){
  gNodes++;
  var timeLimit=curDiff>=4?15000:5000;
  if(gAbort||(gNodes&1023)===0&&Date.now()-gStart>timeLimit){gAbort=true;return 0}
  if(ply>=64)return gEvalBoard(aiP,huP);
  var h=gHash(b),tt=gTT[h%gTTSize];
  if(tt&&tt.h===h&&tt.depth>=depth){
    if(tt.flag===0)return tt.score;
    if(tt.flag===1&&tt.score>=beta)return tt.score;
    if(tt.flag===2&&tt.score<=alpha)return tt.score;
  }
  if(depth===0)return gEvalBoard(aiP,huP);
  var cs=gCands(b,1);
  if(cs.length===0)return gEvalBoard(aiP,huP);
  var threatExt=0;
  if(curDiff>=4&&depth>=2){
    for(var ti=0;ti<cs.length&&ti<6;ti++){
      var tpc=gPatCount(b,cs[ti].x,cs[ti].y,maxP?aiP:huP);
      if(tpc.LIVE_FOUR>0||tpc.RUSH_FOUR>0||tpc.FIVE>0){threatExt=1;break}
    }
  }
  var extDepth=depth+threatExt;
  if(curDiff>=4&&extDepth>=3&&!threatExt){
    var nullSc=-gAlphaBeta(b,extDepth-3,-beta,-beta+1,!maxP,aiP,huP,ply+1);
    if(gAbort)return 0;
    if(nullSc>=beta)return beta;
  }
  var ttBestMove=tt?tt.bm:null;
  var scored=cs.map(function(c){
    var s=gEvalPt(b,c.x,c.y,maxP?aiP:huP)+gEvalPt(b,c.x,c.y,maxP?huP:aiP)*0.9;
    if(ttBestMove&&ttBestMove.x===c.x&&ttBestMove.y===c.y)s+=100000;
    if(gKiller[ply]&&gKiller[ply].x===c.x&&gKiller[ply].y===c.y)s+=5000;
    s+=gHistory[c.y*GS+c.x]||0;
    return{x:c.x,y:c.y,s:s};
  });
  scored.sort(function(a,c){return c.s-a.s});
  var topN=curDiff>=4?16:depth>=4?10:14;
  var top=scored.slice(0,topN);
  var bm=null,oa=alpha,first=true;
  for(var i=0;i<top.length;i++){
    var x=top[i].x,y=top[i].y;if(b[y][x]!==0)continue;
    b[y][x]=maxP?aiP:huP;
    if(gCheckWin(b,x,y,maxP?aiP:huP)){
      b[y][x]=0;
      var ws=maxP?900000+extDepth*100:-900000-extDepth*100;
      if(ws>=beta)return ws;
      if(ws>alpha){alpha=ws;bm={x:x,y:y};first=false}
      continue;
    }
    var sc;
    if(first){sc=-gAlphaBeta(b,extDepth-1,-beta,-alpha,!maxP,aiP,huP,ply+1)}
    else{
      var reduction=0;
      if(curDiff>=4&&i>=4&&extDepth>=3)reduction=1;
      sc=-gAlphaBeta(b,extDepth-1-reduction,-alpha-1,-alpha,!maxP,aiP,huP,ply+1);
      if(sc>alpha&&reduction>0)sc=-gAlphaBeta(b,extDepth-1,-beta,-alpha,!maxP,aiP,huP,ply+1);
    }
    b[y][x]=0;if(gAbort)return 0;
    if(sc>=beta){
      if(!maxP)gKiller[ply]={x:x,y:y};
      gHistory[y*GS+x]=(gHistory[y*GS+x]||0)+extDepth*extDepth;
      gTT[h%gTTSize]={h:h,depth:extDepth,score:sc,flag:1,bm:{x:x,y:y}};
      return sc;
    }
    if(sc>alpha){alpha=sc;bm={x:x,y:y};first=false}
  }
  var flag=first?2:0;
  gTT[h%gTTSize]={h:h,depth:extDepth,score:alpha,flag:flag,bm:bm};
  return alpha;
}
var GOMOKU_OPENINGS=[
  {name:'寒星',w2:[0,1],b3:[0,-1]},{name:'溪月',w2:[0,1],b3:[1,-1]},
  {name:'疏星',w2:[0,1],b3:[1,0]},{name:'花月',w2:[0,1],b3:[1,1]},
  {name:'残月',w2:[0,1],b3:[0,1]},{name:'雨月',w2:[0,1],b3:[-1,1]},
  {name:'金星',w2:[0,1],b3:[-1,0]},{name:'松月',w2:[0,1],b3:[-1,-1]},
  {name:'丘月',w2:[0,1],b3:[1,-2]},{name:'新月',w2:[0,1],b3:[1,2]},
  {name:'瑞星',w2:[0,1],b3:[-1,2]},{name:'山月',w2:[0,1],b3:[-1,-2]},
  {name:'游星',w2:[0,1],b3:[0,2]},
  {name:'长星',w2:[1,1],b3:[2,1]},{name:'峡月',w2:[1,1],b3:[1,2]},
  {name:'恒星',w2:[1,1],b3:[2,2]},{name:'水月',w2:[1,1],b3:[2,0]},
  {name:'流星',w2:[1,1],b3:[2,-1]},{name:'云月',w2:[1,1],b3:[1,0]},
  {name:'浦月',w2:[1,1],b3:[0,1]},{name:'岚月',w2:[1,1],b3:[0,2]},
  {name:'银月',w2:[1,1],b3:[-1,1]},{name:'明星',w2:[1,1],b3:[1,-1]},
  {name:'斜月',w2:[1,1],b3:[2,-2]},{name:'名月',w2:[1,1],b3:[-1,2]},
  {name:'彗星',w2:[1,1],b3:[-1,-1]}
];
function gThreatAnalysis(b,p){
  var opp=3-p;
  var myThreats={five:0,liveFour:0,rushFour:0,liveThree:0,sleepThree:0,liveTwo:0};
  var oppThreats={five:0,liveFour:0,rushFour:0,liveThree:0,sleepThree:0,liveTwo:0};
  var cs=gCands(b,2);
  for(var i=0;i<cs.length;i++){
    var x=cs[i].x,y=cs[i].y;
    var mpc=gPatCount(b,x,y,p),opc=gPatCount(b,x,y,opp);
    if(mpc.FIVE)myThreats.five++;if(mpc.LIVE_FOUR)myThreats.liveFour++;
    if(mpc.RUSH_FOUR)myThreats.rushFour++;if(mpc.LIVE_THREE)myThreats.liveThree++;
    if(mpc.SLEEP_THREE)myThreats.sleepThree++;if(mpc.LIVE_TWO)myThreats.liveTwo++;
    if(opc.FIVE)oppThreats.five++;if(opc.LIVE_FOUR)oppThreats.liveFour++;
    if(opc.RUSH_FOUR)oppThreats.rushFour++;if(opc.LIVE_THREE)oppThreats.liveThree++;
    if(opc.SLEEP_THREE)oppThreats.sleepThree++;if(opc.LIVE_TWO)oppThreats.liveTwo++;
  }
  return{my:myThreats,opp:oppThreats};
}
function gStrategy(b,p){
  var ta=gThreatAnalysis(b,p);
  if(ta.opp.five>0)return'must_defend';
  if(ta.my.five>0)return'must_attack';
  if(ta.opp.liveFour>0)return'must_defend';
  if(ta.my.liveFour>0)return'must_attack';
  if(ta.my.liveThree>=2||(ta.my.liveThree>=1&&ta.my.rushFour>=1))return'attack';
  if(ta.opp.liveThree>=2||(ta.opp.liveThree>=1&&ta.opp.rushFour>=1))return'defend';
  if(ta.my.liveThree>=1)return'attack';
  if(ta.opp.liveThree>=1)return'defend';
  return'balance';
}
function gAIMove(){
  var aiP=playerFirst?2:1,huP=playerFirst?1:2;
  gNodes=0;gStart=Date.now();gAbort=false;
  gTTSize=curDiff>=4?200003:100003;gTT=new Array(gTTSize);
  gKiller=new Array(24);gHistory=new Array(GS*GS).fill(0);
  var cs=gCands(gB,2),stoneCount=0;
  for(var y=0;y<GS;y++)for(var x=0;x<GS;x++)if(gB[y][x]!==0)stoneCount++;
  if(stoneCount===0){showAIInfo('开局 天元');return{x:7,y:7}}
  if(stoneCount===1){
    var op=GOMOKU_OPENINGS[Math.floor(Math.random()*GOMOKU_OPENINGS.length)];
    var ox=7,oy=7;
    for(var yy=0;yy<GS;yy++)for(var xx=0;xx<GS;xx++)if(gB[yy][xx]===1){ox=xx;oy=yy}
    var wx=ox+op.w2[0],wy=oy+op.w2[1];
    if(wx>=0&&wx<GS&&wy>=0&&wy<GS&&gB[wy][wx]===0){showAIInfo('开局定式 '+op.name);return{x:wx,y:wy}}
  }
  for(var i=0;i<cs.length;i++){gB[cs[i].y][cs[i].x]=aiP;if(gCheckWin(gB,cs[i].x,cs[i].y,aiP)){gB[cs[i].y][cs[i].x]=0;showAIInfo('连五 致胜一手');return cs[i]}gB[cs[i].y][cs[i].x]=0}
  for(var i=0;i<cs.length;i++){gB[cs[i].y][cs[i].x]=huP;if(gCheckWin(gB,cs[i].x,cs[i].y,huP)){gB[cs[i].y][cs[i].x]=0;showAIInfo('防守 阻止连五');return cs[i]}gB[cs[i].y][cs[i].x]=0}
  for(var i=0;i<cs.length;i++){var pc=gPatCount(gB,cs[i].x,cs[i].y,aiP);if(pc.LIVE_FOUR>0){showAIInfo('进攻 活四');return cs[i]}}
  for(var i=0;i<cs.length;i++){var pc=gPatCount(gB,cs[i].x,cs[i].y,huP);if(pc.LIVE_FOUR>0){showAIInfo('防守 阻活四');return cs[i]}}
  if(curDiff>=2){
    var vcfDepth=curDiff>=4?28:curDiff===3?14:8;
    var vcf=gVCF(gB,aiP,vcfDepth);
    if(vcf){showAIInfo('VCF 连续冲四杀 (深度'+vcfDepth+')');return vcf}
    var dvcf=gVCF(gB,huP,vcfDepth-4);
    if(dvcf){
      var hasOff=false;
      for(var i=0;i<cs.length;i++){var apc=gPatCount(gB,cs[i].x,cs[i].y,aiP);if(apc.LIVE_FOUR>0){hasOff=true;showAIInfo('反击 活四反击');return cs[i]}}
      if(!hasOff){showAIInfo('防守 阻VCF');return dvcf}
    }
  }
  if(curDiff>=3){
    var vctDepth=curDiff>=4?18:6;
    var vct=gVCT(gB,aiP,vctDepth);
    if(vct){showAIInfo('VCT 连续威胁杀');return vct}
    var dvct=gVCT(gB,huP,curDiff>=4?10:6);
    if(dvct){showAIInfo('防守 阻VCT');return dvct}
  }
  for(var i=0;i<cs.length;i++){var pc=gPatCount(gB,cs[i].x,cs[i].y,aiP);if(pc.LIVE_THREE>=2){showAIInfo('进攻 双活三');return cs[i]}}
  for(var i=0;i<cs.length;i++){var pc=gPatCount(gB,cs[i].x,cs[i].y,huP);if(pc.LIVE_THREE>=2){showAIInfo('防守 阻双活三');return cs[i]}}
  var maxDepth=curDiff===1?4:curDiff===2?6:curDiff===3?8:16;
  var scored=cs.map(function(c){return{x:c.x,y:c.y,s:gEvalPt(gB,c.x,c.y,aiP)*1.5+gEvalPt(gB,c.x,c.y,huP)*1.2}});
  scored.sort(function(a,c){return c.s-a.s});
  var topN=curDiff>=4?24:curDiff>=3?16:10;
  var top=scored.slice(0,Math.min(topN,scored.length));
  var best=top[0],bs=-Infinity;
  var timeLimit=curDiff>=4?15000:5000;
  for(var id=2;id<=maxDepth;id+=2){
    var alpha=-Infinity,beta=Infinity;
    if(id>=6&&bs>-900000&&bs<900000){alpha=bs-50;beta=bs+50}
    var rootBest=null,rootScore=-Infinity;
    for(var i=0;i<top.length;i++){
      gB[top[i].y][top[i].x]=aiP;
      var sc;
      if(i===0){sc=-gAlphaBeta(gB,id-1,-beta,-alpha,false,aiP,huP,0)}
      else{
        sc=-gAlphaBeta(gB,id-1,-alpha-1,-alpha,false,aiP,huP,0);
        if(sc>alpha&&sc<beta)sc=-gAlphaBeta(gB,id-1,-beta,-alpha,false,aiP,huP,0);
      }
      gB[top[i].y][top[i].x]=0;if(gAbort)break;
      if(curDiff<=1)sc+=Math.random()*8-4;
      if(sc>rootScore){rootScore=sc;rootBest=top[i]}
      if(sc>alpha)alpha=sc;
    }
    if(gAbort)break;
    if(rootBest){best=rootBest;bs=rootScore}
    if(bs<=alpha-50||bs>=beta+50){
      gAbort=false;gStart=Date.now();
      for(var ri=0;ri<top.length;ri++){
        gB[top[ri].y][top[ri].x]=aiP;
        var rsc=-gAlphaBeta(gB,id-1,-Infinity,Infinity,false,aiP,huP,0);
        gB[top[ri].y][top[ri].x]=0;if(gAbort)break;
        if(rsc>rootScore){rootScore=rsc;rootBest=top[ri]}
      }
      if(rootBest){best=rootBest;bs=rootScore}
    }
    if(Date.now()-gStart>timeLimit)break;
  }
  var info='搜索 深度'+maxDepth+' 节点'+gNodes;
  if(bs>800000)info+=' [优势]';else if(bs<-800000)info+=' [劣势]';
  showAIInfo(info);
  var wr=scoreToWinRate(bs);
  showWinRate(playerFirst?(100-wr):wr);
  return best;
}
function initGomoku(){
  cv.width=GX;cv.height=GX;cx=cv.getContext('2d');
  gB=[];for(var i=0;i<GS;i++)gB.push(new Array(GS).fill(0));
  gH=[];gCur=1;gAiThink=false;gLast=null;hideOver();showAIInfo('');
  p1Text=playerFirst?'你':'电脑';p2Text=playerFirst?'电脑':'你';
  showWinRate(50);updSt();drawGomoku();
  if(!playerFirst){
    gCur=2;gAiThink=true;thinking=true;updSt();requestRender();
    var _gt=gameToken;
    setTimeout(function(){
      if(gameToken!==_gt)return;
      var m=gAIMove();
      if(m){gB[m.y][m.x]=1;gH.push({x:m.x,y:m.y,p:1});gLast={x:m.x,y:m.y,p:1};drawGomoku()}
      gCur=2;gAiThink=false;thinking=false;updSt();requestRender();
    },50);
  }
}
function drawGomoku(){
  drawPaper(GX,GX);
  cx.strokeStyle='rgba(107,82,48,.35)';cx.lineWidth=1.5;cx.strokeRect(GP-10,GP-10,(GS-1)*GC+20,(GS-1)*GC+20);
  cx.strokeStyle='rgba(80,55,25,.5)';cx.lineWidth=.8;cx.strokeRect(GP-6,GP-6,(GS-1)*GC+12,(GS-1)*GC+12);
  cx.strokeStyle='rgba(70,48,22,.7)';cx.lineWidth=.9;
  for(var i=0;i<GS;i++){
    cx.beginPath();cx.moveTo(GP,GP+i*GC);cx.lineTo(GP+(GS-1)*GC,GP+i*GC);cx.stroke();
    cx.beginPath();cx.moveTo(GP+i*GC,GP);cx.lineTo(GP+i*GC,GP+(GS-1)*GC);cx.stroke();
  }
  var sp=[[3,3],[3,11],[11,3],[11,11],[7,7]];
  cx.fillStyle='rgba(50,33,12,.8)';
  for(var i=0;i<sp.length;i++){cx.beginPath();cx.arc(GP+sp[i][0]*GC,GP+sp[i][1]*GC,3.5,0,Math.PI*2);cx.fill()}
  for(var y=0;y<GS;y++)for(var x=0;x<GS;x++)if(gB[y][x]!==0)drawBall(GP+x*GC,GP+y*GC,GR,gB[y][x]===1);
  if(gLast){cx.strokeStyle=gLast.p===1?'rgba(212,168,90,.95)':'rgba(200,120,120,.95)';cx.lineWidth=2;cx.beginPath();cx.arc(GP+gLast.x*GC,GP+gLast.y*GC,GR+4,0,Math.PI*2);cx.stroke()}
  requestRender();
}
function gomokuPlay(x,y){
  var playerColor=playerFirst?1:2,aiColor=playerFirst?2:1;
  if(over||gAiThink||gCur!==playerColor||gB[y][x]!==0)return;
  gB[y][x]=playerColor;gH.push({x:x,y:y,p:playerColor});gLast={x:x,y:y,p:playerColor};drawGomoku();
  if(gCheckWin(gB,x,y,playerColor)){addS('w');showOver('胜','你赢了','win');return}
  gCur=aiColor;updSt();gAiThink=true;thinking=true;requestRender();
  var _gt=gameToken;
  setTimeout(function(){
    if(gameToken!==_gt)return;
    var m=gAIMove();
    if(m){gB[m.y][m.x]=aiColor;gH.push({x:m.x,y:m.y,p:aiColor});gLast={x:m.x,y:m.y,p:aiColor};drawGomoku();
      if(gCheckWin(gB,m.x,m.y,aiColor)){addS('l');showOver('负','再来一局','lose');gAiThink=false;thinking=false;requestRender();return}}
    gCur=playerColor;gAiThink=false;thinking=false;updSt();requestRender();
  },50);
}
function updSt(){
  if(over)return;
  if(curGame==='gomoku'){
    var playerColor=playerFirst?1:2;
    if(gAiThink){thinking=true;statusText='思考中';statusColor=COL.red}
    else if(gCur===playerColor){thinking=false;statusText='你的回合';statusColor=COL.accent}
    else{thinking=false;statusText='电脑回合';statusColor=COL.inkS}
  }
}
// ============================================================
//  围棋 — 增强MCTS + RAVE + 模式匹配 + 征子判断 + 定式
// ============================================================
var GSZ=19,GOP=24,GOC=30,GOR=13,GOSZ=GOC*(GSZ-1)+GOP*2;
var goB,goKo,goLast,goCur,goPass,goOver,goAi,goH,goCaps,goAbort,goHist;
function initGo(){
  cv.width=GOSZ;cv.height=GOSZ;cx=cv.getContext('2d');
  goB=[];for(var i=0;i<GSZ;i++)goB.push(new Array(GSZ).fill(0));
  goKo=null;goLast=null;goCur=1;goPass=0;goOver=false;goAi=false;goH=null;goCaps=[0,0];goHist=[];hideOver();showAIInfo('');
  p1Text=playerFirst?'你（黑）':'AI（黑）';p2Text=playerFirst?'AI（白）':'你（白）';
  statusText='请落子';statusColor=COL.accent;thinking=false;showWinRate(50);drawGo();
  if(!playerFirst){
    goCur=2;goAi=true;goAbort=false;thinking=true;statusText='思考中';statusColor=COL.red;requestRender();
    var _gt=gameToken;
    goMCTS(goB,1,goKo,function(m){
      if(gameToken!==_gt)return;goAi=false;thinking=false;if(goAbort)return;
      if(m){var r2=goTry(goB,m.move[0],m.move[1],1,goKo);if(r2.valid){goB=r2.newBoard;goKo=r2.newKo;goLast={x:m.move[0],y:m.move[1],c:1};goHist.push({x:m.move[0],y:m.move[1],c:1});drawGo()}}
      goCur=2;statusText='请落子';statusColor=COL.accent;requestRender();
    });
  }
}
var goNbCache=[];
function goNb(x,y){
  var key=x*GSZ+y;if(goNbCache[key])return goNbCache[key];
  var r=[];if(x>0)r.push([x-1,y]);if(x<GSZ-1)r.push([x+1,y]);
  if(y>0)r.push([x,y-1]);if(y<GSZ-1)r.push([x,y+1]);
  goNbCache[key]=r;return r;
}
function goGrp(b,x,y){
  var c=b[x][y];if(c===0)return{stones:[],liberties:[]};
  var vis={},st=[],lb={},q=[[x,y]];vis[x*GSZ+y]=true;
  while(q.length>0){
    var cu=q.shift(),cx2=cu[0],cy2=cu[1];st.push([cx2,cy2]);
    var ns=goNb(cx2,cy2);
    for(var i=0;i<ns.length;i++){
      var nx=ns[i][0],ny=ns[i][1],k=nx*GSZ+ny;
      if(b[nx][ny]===0)lb[k]=true;else if(b[nx][ny]===c&&!vis[k]){vis[k]=true;q.push([nx,ny])}
    }
  }
  return{stones:st,liberties:Object.keys(lb)};
}
function goTry(b,x,y,c,ko){
  if(x<0||x>=GSZ||y<0||y>=GSZ||b[x][y]!==0)return{valid:false};
  if(ko&&ko.x===x&&ko.y===y)return{valid:false};
  var nb=b.map(function(r){return r.slice()});nb[x][y]=c;
  var opp=c===1?2:1,cap=[];var ns=goNb(x,y);
  for(var i=0;i<ns.length;i++){
    var nx=ns[i][0],ny=ns[i][1];
    if(nb[nx][ny]===opp){var g=goGrp(nb,nx,ny);if(g.liberties.length===0){for(var j=0;j<g.stones.length;j++){nb[g.stones[j][0]][g.stones[j][1]]=0;cap.push([g.stones[j][0],g.stones[j][1]])}}}
  }
  var og=goGrp(nb,x,y);if(og.liberties.length===0)return{valid:false};
  var nk=null;if(cap.length===1&&og.stones.length===1)nk={x:cap[0][0],y:cap[0][1]};
  return{valid:true,captured:cap,newBoard:nb,newKo:nk};
}
function goLegal(b,c,ko){
  var m=[];for(var x=0;x<GSZ;x++)for(var y=0;y<GSZ;y++){if(b[x][y]!==0)continue;var r=goTry(b,x,y,c,ko);if(r.valid)m.push([x,y])}
  return m;
}
function goIsEye(b,x,y,c){
  var ns=goNb(x,y);
  for(var i=0;i<ns.length;i++)if(b[ns[i][0]][ns[i][1]]!==c)return false;
  var dg=[[x-1,y-1],[x+1,y-1],[x-1,y+1],[x+1,y+1]],sc=0,wl=0;
  for(var i=0;i<dg.length;i++){
    if(dg[i][0]<0||dg[i][0]>=GSZ||dg[i][1]<0||dg[i][1]>=GSZ)wl++;
    else if(b[dg[i][0]][dg[i][1]]===c)sc++;else wl++;
  }
  if(wl>0)return(sc+wl>=4);return sc>=3;
}
function goFilt(b,m,c){return m.filter(function(mm){return!goIsEye(b,mm[0],mm[1],c)})}
function goLadder(b,x,y,c){var opp=c===1?2:1;var g=goGrp(b,x,y);if(g.liberties.length!==1)return false;return goLadderRec(b,g,c,opp,0)}
function goLadderRec(tb,g,c,opp,depth){
  if(depth>80)return true;
  var lib=g.liberties[0];var lx=parseInt(lib/GSZ),ly=parseInt(lib%GSZ);
  var dr=goTry(tb,lx,ly,c,null);if(!dr.valid)return true;
  var ng=goGrp(dr.newBoard,lx,ly);
  if(ng.liberties.length===0)return true;if(ng.liberties.length>=3)return false;
  if(ng.liberties.length===1){
    var lib2=ng.liberties[0];var ax=parseInt(lib2/GSZ),ay=parseInt(lib2%GSZ);
    var ar=goTry(dr.newBoard,ax,ay,opp,null);if(!ar.valid)return false;return true;
  }
  for(var i=0;i<2;i++){
    var alib=ng.liberties[i];var ax2=parseInt(alib/GSZ),ay2=parseInt(alib%GSZ);
    var ar2=goTry(dr.newBoard,ax2,ay2,opp,null);if(!ar2.valid)continue;
    var ds=null;for(var j=0;j<ng.stones.length;j++){if(ar2.newBoard[ng.stones[j][0]][ng.stones[j][1]]===c){ds=ng.stones[j];break}}
    if(!ds)return true;
    var dg=goGrp(ar2.newBoard,ds[0],ds[1]);
    if(dg.liberties.length===0)return true;
    if(dg.liberties.length===1){if(goLadderRec(ar2.newBoard,dg,c,opp,depth+1))return true}
  }
  return false;
}
function goInfluence(b){
  var inf=[];for(var i=0;i<GSZ;i++)inf.push(new Array(GSZ).fill(0));
  for(var x=0;x<GSZ;x++)for(var y=0;y<GSZ;y++){
    if(b[x][y]===0)continue;var val=b[x][y]===1?1:-1;
    for(var dx=-4;dx<=4;dx++)for(var dy=-4;dy<=4;dy++){
      var nx=x+dx,ny=y+dy,d=Math.abs(dx)+Math.abs(dy);
      if(nx<0||nx>=GSZ||ny<0||ny>=GSZ||d===0)continue;
      var decay=d<=1?0.8:d<=2?0.4:d<=3?0.2:0.1;inf[nx][ny]+=val*decay;
    }
  }
  return inf;
}
function goTerr(b){
  var t=[];for(var i=0;i<GSZ;i++)t.push(new Array(GSZ).fill(0));
  var vis=[];for(var i=0;i<GSZ;i++)vis.push(new Array(GSZ).fill(false));
  for(var x=0;x<GSZ;x++)for(var y=0;y<GSZ;y++){
    if(b[x][y]!==0||vis[x][y])continue;
    var reg=[],bd={},q=[[x,y]];vis[x][y]=true;
    while(q.length>0){
      var cu=q.shift(),cx2=cu[0],cy2=cu[1];reg.push([cx2,cy2]);var ns=goNb(cx2,cy2);
      for(var i=0;i<ns.length;i++){var nx=ns[i][0],ny=ns[i][1];if(b[nx][ny]===0&&!vis[nx][ny]){vis[nx][ny]=true;q.push([nx,ny])}else if(b[nx][ny]!==0)bd[b[nx][ny]]=true}
    }
    var bk=Object.keys(bd);if(bk.length===1){var o=parseInt(bk[0]);for(var i=0;i<reg.length;i++)t[reg[i][0]][reg[i][1]]=o}
  }
  return t;
}
function goScore(b){
  var t=goTerr(b),bk=0,wt=0;
  for(var x=0;x<GSZ;x++)for(var y=0;y<GSZ;y++){
    if(b[x][y]===1)bk++;else if(b[x][y]===2)wt++;
    else if(t[x][y]===1)bk++;else if(t[x][y]===2)wt++;
  }
  wt+=7.5;return{black:bk,white:wt};
}
function goBenson(b){
  var alive={1:[],2:[]};var chains={1:[],2:[]};
  var visited=[];for(var i=0;i<GSZ;i++)visited.push(new Array(GSZ).fill(false));
  for(var x=0;x<GSZ;x++)for(var y=0;y<GSZ;y++){
    if(b[x][y]===0||visited[x][y])continue;var c=b[x][y];var g=goGrp(b,x,y);
    var chain={color:c,stones:g.stones,liberties:g.liberties.map(function(l){return[parseInt(l/GSZ),parseInt(l%GSZ)]})};
    chains[c].push(chain);for(var i2=0;i2<g.stones.length;i2++)visited[g.stones[i2][0]][g.stones[i2][1]]=true;
  }
  var regions=[];var rvis=[];for(var i=0;i<GSZ;i++)rvis.push(new Array(GSZ).fill(false));
  for(var x=0;x<GSZ;x++)for(var y=0;y<GSZ;y++){
    if(b[x][y]!==0||rvis[x][y])continue;
    var reg=[],bdr={},q=[[x,y]];rvis[x][y]=true;
    while(q.length>0){
      var cu=q.shift(),cx2=cu[0],cy2=cu[1];reg.push([cx2,cy2]);var ns=goNb(cx2,cy2);
      for(var i2=0;i2<ns.length;i2++){var nx=ns[i2][0],ny=ns[i2][1];if(b[nx][ny]===0&&!rvis[nx][ny]){rvis[nx][ny]=true;q.push([nx,ny])}else if(b[nx][ny]!==0)bdr[b[nx][ny]]=true}
    }
    var bkeys=Object.keys(bdr);if(bkeys.length===1)regions.push({color:parseInt(bkeys[0]),points:reg});
  }
  var changed=true;var aliveChains={1:new Set(),2:new Set()};
  while(changed){
    changed=false;
    for(var ci=0;ci<2;ci++){
      var c=ci+1;
      for(var i=0;i<chains[c].length;i++){
        var chain=chains[c][i];if(aliveChains[c].has(i))continue;
        var vitalCount=0;
        for(var j=0;j<regions.length;j++){
          if(regions[j].color!==c)continue;var isVital=true;
          var chainLibSet={};for(var li=0;li<chain.liberties.length;li++)chainLibSet[chain.liberties[li][0]*GSZ+chain.liberties[li][1]]=true;
          for(var pi=0;pi<regions[j].points.length;pi++){var pt=regions[j].points[pi];if(!chainLibSet[pt[0]*GSZ+pt[1]]){isVital=false;break}}
          if(isVital)vitalCount++;
        }
        if(vitalCount>=2){aliveChains[c].add(i);changed=true}
      }
    }
  }
  for(var ci=0;ci<2;ci++){var c=ci+1;aliveChains[c].forEach(function(idx){var chain=chains[c][idx];for(var i=0;i<chain.stones.length;i++)alive[c].push(chain.stones[i])})}
  return alive;
}
var GO_JOSEKI=[
  {trigger:[[3,3,1]],moves:[[3,3,1],[5,3,2],[3,5,1],[5,5,2]]},
  {trigger:[[3,3,1]],moves:[[3,3,1],[4,4,2],[3,5,1],[5,4,2]]},
  {trigger:[[3,4,1]],moves:[[3,4,1],[4,3,2],[3,5,1],[5,3,2]]},
  {trigger:[[2,2,1]],moves:[[2,2,1],[3,3,2],[2,3,1],[3,2,2]]},
  {trigger:[[3,3,1]],moves:[[3,3,1],[5,3,2],[3,5,1],[5,5,2],[2,5,1],[5,2,2]]},
  {trigger:[[3,3,1]],moves:[[3,3,1],[5,3,2],[4,3,1],[5,4,2],[4,4,1],[6,3,2]]},
  {trigger:[[4,3,1]],moves:[[4,3,1],[3,4,2],[4,5,1],[5,4,2]]},
  {trigger:[[3,4,1]],moves:[[3,4,1],[2,3,2],[3,5,1],[2,4,2]]},
  {trigger:[[3,3,1]],moves:[[3,3,1],[5,3,2],[3,5,1],[5,5,2],[2,2,1]]},
  {trigger:[[3,3,1]],moves:[[3,3,1],[15,15,2],[3,15,1],[15,3,2]]},
  {trigger:[[3,3,1]],moves:[[3,3,1],[15,3,2],[15,15,1],[3,15,2]]},
  {trigger:[[3,3,1]],moves:[[3,3,1],[5,3,2],[4,2,1],[5,4,2],[4,3,1],[6,3,2]]},
  {trigger:[[3,3,1]],moves:[[3,3,1],[4,4,2],[3,5,1],[5,4,2],[4,5,1],[5,5,2]]},
  {trigger:[[3,4,1]],moves:[[3,4,1],[4,5,2],[3,3,1],[5,4,2]]},
  {trigger:[[3,4,1]],moves:[[3,4,1],[5,5,2],[3,3,1],[4,3,2]]},
  {trigger:[[2,2,1]],moves:[[2,2,1],[4,3,2],[2,3,1],[3,2,2]]},
  {trigger:[[3,3,1]],moves:[[3,3,1],[5,3,2],[5,5,2],[3,5,1],[4,4,2]]},
  {trigger:[[4,3,1]],moves:[[4,3,1],[5,4,2],[4,5,1],[5,3,2]]},
  {trigger:[[3,4,1]],moves:[[3,4,1],[2,5,2],[3,3,1],[2,4,2]]}
];
function goMatchJoseki(b){
  var stones=[];for(var x=0;x<GSZ;x++)for(var y=0;y<GSZ;y++)if(b[x][y]!==0)stones.push([x,y,b[x][y]]);
  if(stones.length>12)return null;
  for(var i=0;i<GO_JOSEKI.length;i++){
    var j=GO_JOSEKI[i];if(stones.length>=j.moves.length)continue;
    var match=true;
    for(var k=0;k<stones.length;k++){if(stones[k][0]!==j.moves[k][0]||stones[k][1]!==j.moves[k][1]||stones[k][2]!==j.moves[k][2]){match=false;break}}
    if(match){
      var next=j.moves[stones.length];
      var r=goTry(b,next[0],next[1],next[2],null);if(r.valid)return{x:next[0],y:next[1]};
      var sx1=GSZ-1-next[0],sy1=next[1];r=goTry(b,sx1,sy1,next[2],null);if(r.valid)return{x:sx1,y:sy1};
      var sx2=next[0],sy2=GSZ-1-next[1];r=goTry(b,sx2,sy2,next[2],null);if(r.valid)return{x:sx2,y:sy2};
      var sx3=GSZ-1-next[0],sy3=GSZ-1-next[1];r=goTry(b,sx3,sy3,next[2],null);if(r.valid)return{x:sx3,y:sy3};
    }
  }
  return null;
}
function go3x3(b,x,y,c){
  var opp=c===1?2:1;var pat=0;
  var dx=[-1,0,1,-1,1,-1,0,1],dy=[-1,-1,-1,0,0,1,1,1];
  for(var i=0;i<8;i++){var nx=x+dx[i],ny=y+dy[i];var v=0;if(nx<0||nx>=GSZ||ny<0||ny>=GSZ)v=2;else if(b[nx][ny]===c)v=1;else if(b[nx][ny]===opp)v=2;pat=pat*3+v}
  return pat;
}
function goPatternWeight(b,x,y,c){
  var w=1.0;var ns=goNb(x,y);var own=0,opp=0;
  for(var i=0;i<ns.length;i++){if(b[ns[i][0]][ns[i][1]]===c)own++;else if(b[ns[i][0]][ns[i][1]]===3-c)opp++}
  if(own>=1)w+=0.5;if(own>=2)w+=0.3;if(opp>=1)w+=0.4;
  var dg=[[x-1,y-1],[x+1,y-1],[x-1,y+1],[x+1,y+1]];
  for(var i=0;i<dg.length;i++){if(dg[i][0]>=0&&dg[i][0]<GSZ&&dg[i][1]>=0&&dg[i][1]<GSZ&&b[dg[i][0]][dg[i][1]]===c)w+=0.2}
  var edge=Math.min(x,y,GSZ-1-x,GSZ-1-y);
  if(edge===2)w+=0.15;if(edge===3)w+=0.25;if(edge===0)w*=0.3;if(edge===1)w*=0.6;
  return w;
}
function goSim(b,c,ko,max){
  var sb=b.map(function(r){return r.slice()}),sk=ko?{x:ko.x,y:ko.y}:null,sc=c,ps=0,mc=0;
  while(ps<2&&mc<max){
    var m=goLegal(sb,sc,sk);
    if(m.length===0){ps++;sk=null;sc=sc===1?2:1;mc++;continue}
    var f=goFilt(sb,m,sc);var um=f.length>0?f:m;
    var ch=null,opp=sc===1?2:1;
    for(var i=0;i<um.length;i++){
      var ns=goNb(um[i][0],um[i][1]);
      for(var j=0;j<ns.length;j++){if(sb[ns[j][0]][ns[j][1]]===opp){var g=goGrp(sb,ns[j][0],ns[j][1]);if(g.liberties.length===1){ch=um[i];break}}}
      if(ch)break;
    }
    if(!ch){
      for(var i=0;i<um.length;i++){
        var ns2=goNb(um[i][0],um[i][1]);
        for(var j=0;j<ns2.length;j++){
          if(sb[ns2[j][0]][ns2[j][1]]===sc){var g2=goGrp(sb,ns2[j][0],ns2[j][1]);if(g2.liberties.length===1){if(!goLadder(sb,ns2[j][0],ns2[j][1],sc)){ch=um[i];break}}}
        }
        if(ch)break;
      }
    }
    if(!ch){
      var nr=[],tw=0;
      for(var i=0;i<um.length;i++){
        var ns3=goNb(um[i][0],um[i][1]);var near=false;
        for(var j=0;j<ns3.length;j++){if(sb[ns3[j][0]][ns3[j][1]]!==0){near=true;break}}
        if(near){var w=goPatternWeight(sb,um[i][0],um[i][1],sc);nr.push({m:um[i],w:w});tw+=w}
      }
      if(nr.length>0&&tw>0){var rnd=Math.random()*tw,cw=0;for(var i=0;i<nr.length;i++){cw+=nr[i].w;if(rnd<=cw){ch=nr[i].m;break}}}
      if(!ch){var pool=um;ch=pool[Math.floor(Math.random()*pool.length)]}
    }
    var r=goTry(sb,ch[0],ch[1],sc,sk);if(r.valid){sb=r.newBoard;sk=r.newKo}else{sk=null}
    ps=0;sc=sc===1?2:1;mc++;
  }
  var t=goTerr(sb),bk=0,wt=0;
  for(var x=0;x<GSZ;x++)for(var y=0;y<GSZ;y++){
    if(sb[x][y]===1)bk++;else if(sb[x][y]===2)wt++;else if(t[x][y]===1)bk++;else if(t[x][y]===2)wt++;
  }
  wt+=7.5;var d=bk-wt;return 1/(1+Math.exp(-d*0.4*(c===1?1:-1)));
}
function goMCTS(b,c,ko,onMCTSResult){
  if(curDiff>=2){var joseki=goMatchJoseki(b);if(joseki){showAIInfo('定式 角部定式应手');onMCTSResult({move:[joseki.x,joseki.y]});return}}
  var ST=[[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
  var m=goLegal(b,c,ko);var cnt=0;
  for(var x=0;x<GSZ;x++)for(var y=0;y<GSZ;y++)if(b[x][y]!==0)cnt++;
  if(cnt<=8){var gm=m.filter(function(mm){return ST.some(function(p){return p[0]===mm[0]&&p[1]===mm[1]})});if(gm.length>0)m=gm}
  var f=goFilt(b,m,c),um=f.length>0?f:m;
  if(um.length===0){onMCTSResult(null);return}
  var SIMS=curDiff===1?200:curDiff===2?400:curDiff===3?700:1000;
  var MAXSIM=curDiff===1?40:curDiff===2?60:curDiff===3?80:100;
  var root={parent:null,move:null,color:c===1?2:1,children:[],visits:0,wins:0,untried:um.map(function(v){return[v[0],v[1]]}),raveV:{},raveW:{}};
  var nodes=0,mctsStart=Date.now(),CHUNK=50,si=0;
  function runChunk(){
    if(goAbort){onDone();return}
    var end=Math.min(si+CHUNK,SIMS);
    for(var s=si;s<end;s++){
      if((s&15)===0&&Date.now()-mctsStart>4000)break;
      var node=root,sb=b.map(function(r){return r.slice()}),sk=ko?{x:ko.x,y:ko.y}:null,playedMoves=[];
      while(node.untried.length===0&&node.children.length>0){
        var best=null,bv=-Infinity;
        for(var i=0;i<node.children.length;i++){
          var ch=node.children[i];if(ch.visits===0){best=ch;break}
          var mcVal=ch.wins/ch.visits;
          var raveN=ch.raveV[ch.move?ch.move[0]*GSZ+ch.move[1]:0]||0;
          var raveW=ch.raveW[ch.move?ch.move[0]*GSZ+ch.move[1]:0]||0;
          var raveVal=raveN>0?raveW/raveN:0.5;
          var beta=raveN/(raveN+ch.visits+4*0.5*raveN*ch.visits);
          var q=(1-beta)*mcVal+beta*raveVal;
          var ucb=q+1.4*Math.sqrt(Math.log(node.visits)/ch.visits);
          if(ucb>bv){bv=ucb;best=ch}
        }
        if(!best)break;node=best;
        if(node.move){var r=goTry(sb,node.move[0],node.move[1],node.color,sk);if(!r.valid)break;sb=r.newBoard;sk=r.newKo;playedMoves.push({move:node.move,color:node.color})}
      }
      if(node.untried.length>0){
        var idx=Math.floor(Math.random()*node.untried.length);var mv=node.untried.splice(idx,1)[0];
        var mc2=node.color===1?2:1;var r2=goTry(sb,mv[0],mv[1],mc2,sk);if(r2.valid){sb=r2.newBoard;sk=r2.newKo}
        var cm=goLegal(sb,mc2===1?2:1,sk),cf=goFilt(sb,cm,mc2===1?2:1);
        var child={parent:node,move:mv,color:mc2,children:[],visits:0,wins:0,untried:(cf.length>0?cf:cm).map(function(v){return[v[0],v[1]]}),raveV:{},raveW:{}};
        node.children.push(child);node=child;playedMoves.push({move:mv,color:mc2});
      }
      var sr=goSim(sb,node.color===1?2:1,sk,MAXSIM);
      var n=node,addSr=false;
      while(n!==null){
        n.visits++;var wp=addSr?sr:(1-sr);n.wins+=wp;
        for(var pi=0;pi<playedMoves.length;pi++){if(playedMoves[pi].color===n.color){var mk=playedMoves[pi].move[0]*GSZ+playedMoves[pi].move[1];n.raveV[mk]=(n.raveV[mk]||0)+1;n.raveW[mk]=(n.raveW[mk]||0)+wp}}
        addSr=!addSr;n=n.parent;
      }
      nodes++;
    }
    si=end;
    if(si<SIMS&&!goAbort)setTimeout(runChunk,0);else onDone();
  }
  function onDone(){
    var bn=null,bvis=-1;
    for(var i=0;i<root.children.length;i++){if(root.children[i].visits>bvis){bvis=root.children[i].visits;bn=root.children[i]}}
    var aiWr=50;var info='MCTS '+si+'次模拟 RAVE '+nodes+'节点';
    if(bn){aiWr=bn.wins/bn.visits*100;info+=' 胜率'+aiWr.toFixed(1)+'%'}
    showAIInfo(info);showWinRate(100-aiWr);
    onMCTSResult(bn?{move:bn.move}:null);
  }
  setTimeout(runChunk,0);
}
function drawGo(){
  var tex=makeWoodTexture(GOSZ,GOSZ,54321);cx.drawImage(tex,0,0);
  cx.strokeStyle='rgba(60,42,20,.6)';cx.lineWidth=1.5;cx.strokeRect(GOP-8,GOP-8,(GSZ-1)*GOC+16,(GSZ-1)*GOC+16);
  cx.strokeStyle='#4a3d2f';cx.lineWidth=.7;
  for(var i=0;i<GSZ;i++){
    cx.beginPath();cx.moveTo(GOP+i*GOC,GOP);cx.lineTo(GOP+i*GOC,GOP+(GSZ-1)*GOC);cx.stroke();
    cx.beginPath();cx.moveTo(GOP,GOP+i*GOC);cx.lineTo(GOP+(GSZ-1)*GOC,GOP+i*GOC);cx.stroke();
  }
  var sp=[[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
  cx.fillStyle='#3a2d1f';
  for(var i=0;i<sp.length;i++){cx.beginPath();cx.arc(GOP+sp[i][0]*GOC,GOP+sp[i][1]*GOC,2.8,0,Math.PI*2);cx.fill()}
  for(var x=0;x<GSZ;x++)for(var y=0;y<GSZ;y++)if(goB[x][y]!==0)drawBall(GOP+x*GOC,GOP+y*GOC,GOR,goB[x][y]===1);
  if(goLast&&goB[goLast.x][goLast.y]===goLast.c){cx.strokeStyle=goLast.c===1?'rgba(212,168,90,.95)':'rgba(200,120,120,.95)';cx.lineWidth=2;cx.beginPath();cx.arc(GOP+goLast.x*GOC,GOP+goLast.y*GOC,7,0,Math.PI*2);cx.stroke()}
  if(goH&&!goAi&&!goOver&&goB[goH.x][goH.y]===0){cx.save();cx.globalAlpha=.4;drawBall(GOP+goH.x*GOC,GOP+goH.y*GOC,GOR,goCur===1);cx.restore()}
  cx.fillStyle='#6b5d4f';cx.font='bold 9px Georgia,serif';cx.textAlign='center';cx.textBaseline='middle';
  var L='ABCDEFGHJKLMNOPQRST';
  for(var i=0;i<GSZ;i++){cx.fillText(L[i],GOP+i*GOC,GOP-16);cx.fillText(String(GSZ-i),GOP-16,GOP+i*GOC)}
  requestRender();
}
function goPlay(x,y){
  var playerColor=playerFirst?1:2;if(goOver||goAi||goCur!==playerColor)return;
  var r=goTry(goB,x,y,playerColor,goKo);if(!r.valid)return;
  goB=r.newBoard;goKo=r.newKo;goLast={x:x,y:y,c:playerColor};goPass=0;goHist.push({x:x,y:y,c:playerColor});
  if(r.captured.length>0)goCaps[playerFirst?0:1]+=r.captured.length;drawGo();
  var aiColor=playerFirst?2:1;goCur=aiColor;
  thinking=true;statusText='思考中';statusColor=COL.red;requestRender();goAi=true;goAbort=false;
  var _gt=gameToken;
  goMCTS(goB,aiColor,goKo,function(m){
    if(gameToken!==_gt)return;goAi=false;thinking=false;if(goAbort)return;
    if(!m){goPass++;if(goPass>=2){goEnd();return}goCur=playerColor;statusText='请落子';statusColor=COL.accent;requestRender();return}
    var r2=goTry(goB,m.move[0],m.move[1],aiColor,goKo);
    if(r2.valid){goB=r2.newBoard;goKo=r2.newKo;goLast={x:m.move[0],y:m.move[1],c:aiColor};goHist.push({x:m.move[0],y:m.move[1],c:aiColor});if(r2.captured.length>0)goCaps[playerFirst?1:0]+=r2.captured.length;drawGo()}
    goPass=0;goCur=playerColor;statusText='请落子';statusColor=COL.accent;requestRender();
  });
}
function goEnd(){
  goOver=true;var alive=goBenson(goB);var s=goScore(goB);
  var aliveBonus={black:0,white:0};
  for(var i=0;i<alive[1].length;i++)aliveBonus.black++;for(var i=0;i<alive[2].length;i++)aliveBonus.white++;
  var resultTxt='黑'+s.black.toFixed(1)+' 白'+s.white.toFixed(1);
  if(s.black>s.white){addS('w');showOver('胜',resultTxt,'win')}
  else if(s.white>s.black){addS('l');showOver('负',resultTxt,'lose')}
  else{showOver('和',resultTxt,'draw')}
}
// ============================================================
//  中国象棋 — 迭代加深PVS + 置换表 + MVV-LVA + 杀手走法
//  + 历史启发 + 空着剪枝 + 静态搜索 + 开局库
// ============================================================
var XC=54,XP=40,XW=8*XC+XP*2,XH=9*XC+XP*2;
var XC_H={1:'帥',2:'仕',3:'相',4:'傌',5:'俥',6:'炮',7:'兵',8:'將',9:'士',10:'象',11:'馬',12:'車',13:'炮',14:'卒'};
function xqInitBoard(){
  return [[12,11,10,9,8,9,10,11,12],[0,0,0,0,0,0,0,0,0],[0,13,0,0,0,0,0,13,0],[14,0,14,0,14,0,14,0,14],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[7,0,7,0,7,0,7,0,7],[0,6,0,0,0,0,0,6,0],[0,0,0,0,0,0,0,0,0],[5,4,3,2,1,2,3,4,5]];
}
var XV=[0,10000,200,200,400,900,450,100,10000,200,200,400,900,450,100];
var xqB,xqRed,xqSel,xqLegal,xqHist,xqOver,xqAi,xqTT,xqKiller,xqHist2,xqAiRed;
var xqNodes,xqStart,xqAbort,xqPv;
function initXQ(){
  cv.width=XW;cv.height=XH;cx=cv.getContext('2d');
  xqB=[[12,11,10,9,8,9,10,11,12],[0,0,0,0,0,0,0,0,0],[0,13,0,0,0,0,0,13,0],[14,0,14,0,14,0,14,0,14],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[7,0,7,0,7,0,7,0,7],[0,6,0,0,0,0,0,6,0],[0,0,0,0,0,0,0,0,0],[5,4,3,2,1,2,3,4,5]];
  xqRed=playerFirst;xqAiRed=!playerFirst;xqSel=null;xqLegal=[];xqHist=[];xqOver=false;xqAi=false;xqTT=new Map();hideOver();showAIInfo('');
  p1Text=playerFirst?'你（红）':'AI（红）';p2Text=playerFirst?'AI（黑）':'你（黑）';
  statusText=playerFirst?'你的回合':'AI回合';statusColor=COL.accent;thinking=false;moveListText='';showWinRate(50);drawXQ();
  if(!playerFirst){
    thinking=true;statusText='思考中';statusColor=COL.red;xqAi=true;requestRender();
    var _gt=gameToken;
    setTimeout(function(){
      if(gameToken!==_gt)return;
      var bm=xqAIMove();xqAi=false;thinking=false;
      if(bm){xqB[bm.tr][bm.tc]=xqB[bm.fr][bm.fc];xqB[bm.fr][bm.fc]=0;xqHist.push(bm)}
      xqRed=false;drawXQ();xqUpdM();
      var mc=xqCheck(xqB,false)?' 你被将军':'';
      statusText='你的回合'+mc;statusColor=COL.accent;requestRender();
    },50);
  }
}
function xqRedP(p){return p>=1&&p<=7}
function xqSame(a,b){return(a>=1&&a<=7&&b>=1&&b<=7)||(a>=8&&a<=14&&b>=8&&b<=14)}
function xqType(p){return p===0?0:(p<=7?p:p-7)}
function xqInB(r,c){return r>=0&&r<10&&c>=0&&c<9}
function xqPal(r,c,red){if(c<3||c>5)return false;return red?(r>=7&&r<=9):(r>=0&&r<=2)}
function xqGen(b,red){
  var m=[];
  for(var r=0;r<10;r++)for(var c=0;c<9;c++){
    var p=b[r][c];if(p===0)continue;
    if(red&&!xqRedP(p))continue;if(!red&&xqRedP(p))continue;
    xqGP(b,r,c,p,m);
  }
  return m;
}
function xqGP(b,r,c,p,m){
  var t=xqType(p),red=xqRedP(p);
  if(t===5){var d=[[-1,0],[1,0],[0,-1],[0,1]];for(var i=0;i<4;i++){var nr=r+d[i][0],nc=c+d[i][1];while(xqInB(nr,nc)){if(b[nr][nc]===0)m.push({fr:r,fc:c,tr:nr,tc:nc,piece:p,captured:0});else{if(!xqSame(p,b[nr][nc]))m.push({fr:r,fc:c,tr:nr,tc:nc,piece:p,captured:b[nr][nc]});break}nr+=d[i][0];nc+=d[i][1]}}}
  else if(t===4){var km=[[-2,-1,-1,0],[-2,1,-1,0],[2,-1,1,0],[2,1,1,0],[-1,-2,0,-1],[-1,2,0,1],[1,-2,0,-1],[1,2,0,1]];for(var i=0;i<8;i++){var nr=r+km[i][0],nc=c+km[i][1];if(!xqInB(nr,nc))continue;if(b[r+km[i][2]][c+km[i][3]]!==0)continue;if(b[nr][nc]===0||!xqSame(p,b[nr][nc]))m.push({fr:r,fc:c,tr:nr,tc:nc,piece:p,captured:b[nr][nc]})}}
  else if(t===3){var bm=[[-2,-2,-1,-1],[-2,2,-1,1],[2,-2,1,-1],[2,2,1,1]];for(var i=0;i<4;i++){var nr=r+bm[i][0],nc=c+bm[i][1];if(!xqInB(nr,nc))continue;if(red&&nr<5)continue;if(!red&&nr>4)continue;if(b[r+bm[i][2]][c+bm[i][3]]!==0)continue;if(b[nr][nc]===0||!xqSame(p,b[nr][nc]))m.push({fr:r,fc:c,tr:nr,tc:nc,piece:p,captured:b[nr][nc]})}}
  else if(t===2){var am=[[-1,-1],[-1,1],[1,-1],[1,1]];for(var i=0;i<4;i++){var nr=r+am[i][0],nc=c+am[i][1];if(!xqPal(nr,nc,red))continue;if(b[nr][nc]===0||!xqSame(p,b[nr][nc]))m.push({fr:r,fc:c,tr:nr,tc:nc,piece:p,captured:b[nr][nc]})}}
  else if(t===1){var kd=[[-1,0],[1,0],[0,-1],[0,1]];for(var i=0;i<4;i++){var nr=r+kd[i][0],nc=c+kd[i][1];if(!xqPal(nr,nc,red))continue;if(b[nr][nc]===0||!xqSame(p,b[nr][nc]))m.push({fr:r,fc:c,tr:nr,tc:nc,piece:p,captured:b[nr][nc]})}}
  else if(t===6){var cd=[[-1,0],[1,0],[0,-1],[0,1]];for(var i=0;i<4;i++){var nr=r+cd[i][0],nc=c+cd[i][1],jp=false;while(xqInB(nr,nc)){if(b[nr][nc]===0){if(!jp)m.push({fr:r,fc:c,tr:nr,tc:nc,piece:p,captured:0})}else{if(!jp)jp=true;else{if(!xqSame(p,b[nr][nc]))m.push({fr:r,fc:c,tr:nr,tc:nc,piece:p,captured:b[nr][nc]});break}}nr+=cd[i][0];nc+=cd[i][1]}}}
  else if(t===7){var fwd=red?-1:1,nr=r+fwd;if(xqInB(nr,c)){if(b[nr][c]===0||!xqSame(p,b[nr][c]))m.push({fr:r,fc:c,tr:nr,tc:c,piece:p,captured:b[nr][c]})}var cr=red?r<=4:r>=5;if(cr){for(var dc=-1;dc<=1;dc+=2){var nc=c+dc;if(xqInB(r,nc)){if(b[r][nc]===0||!xqSame(p,b[r][nc]))m.push({fr:r,fc:c,tr:r,tc:nc,piece:p,captured:b[r][nc]})}}}}
}
function xqKing(b,red){var tg=red?1:8;for(var r=0;r<10;r++)for(var c=0;c<9;c++)if(b[r][c]===tg)return[r,c];return null}
function xqCheck(b,red){
  var k=xqKing(b,red);if(!k)return true;
  var ok=xqKing(b,!red);
  if(ok&&k[1]===ok[1]){var cnt=0;for(var r=Math.min(k[0],ok[0])+1;r<Math.max(k[0],ok[0]);r++)if(b[r][k[1]]!==0)cnt++;if(cnt===0)return true}
  var om=xqGen(b,!red);
  for(var i=0;i<om.length;i++)if(om[i].tr===k[0]&&om[i].tc===k[1])return true;
  return false;
}
function xqLegalMoves(b,red){
  var all=xqGen(b,red),lg=[];
  for(var i=0;i<all.length;i++){
    var m=all[i],nb=b.map(function(r){return r.slice()});
    nb[m.tr][m.tc]=nb[m.fr][m.fc];nb[m.fr][m.fc]=0;
    if(!xqCheck(nb,red))lg.push(m);
  }
  return lg;
}
var xqZob=[];
for(var i=0;i<15*10*9;i++)xqZob.push(Math.random()*0xFFFFFFFF);
var xqZobRed=Math.random()*0xFFFFFFFF;
function xqH(b,red){var h=red?xqZobRed:0;for(var r=0;r<10;r++)for(var c=0;c<9;c++){var p=b[r][c];if(p!==0)h^=xqZob[p*90+r*9+c]}return h>>>0}
var XQ_PP=[[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[6,0,6,0,8,0,6,0,6],[10,0,10,0,12,0,10,0,10],[14,0,14,0,16,0,14,0,14],[18,18,20,24,26,24,20,18,18],[20,20,22,26,28,26,22,20,20]];
var XQ_RP=[[14,14,12,18,16,18,12,14,14],[16,20,18,24,26,24,18,20,16],[12,12,12,18,18,18,12,12,12],[12,18,16,22,22,22,16,18,12],[12,14,12,18,18,18,12,14,12],[12,16,14,20,20,20,14,16,12],[6,10,8,14,14,14,8,10,6],[4,8,6,14,12,14,6,8,4],[8,4,8,16,8,16,8,4,8],[-2,10,6,14,12,14,6,10,-2]];
var XQ_KP=[[4,8,16,12,4,12,16,8,4],[4,10,28,16,8,16,28,10,4],[12,14,16,20,18,20,16,14,12],[8,24,18,24,20,24,18,24,8],[6,16,14,18,16,18,14,16,6],[4,12,16,14,12,14,16,12,4],[2,6,8,6,10,6,8,6,2],[4,2,8,8,4,8,8,2,4],[0,2,4,4,-2,4,4,2,0],[0,-4,0,0,0,0,0,-4,0]];
var XQ_CP=[[6,4,0,-10,-12,-10,0,4,6],[2,2,0,-4,-14,-4,0,2,2],[2,2,0,-10,-8,-10,0,2,2],[0,0,-2,4,10,4,-2,0,0],[0,0,0,0,2,0,0,0,0],[-2,0,4,2,6,2,4,0,-2],[0,0,0,2,8,2,0,0,0],[4,0,8,6,10,6,8,0,4],[0,2,4,6,6,6,4,2,0],[0,0,2,6,6,6,2,0,0]];
var XQ_AP=[[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]];
function xqFlip(t){var r=[];for(var i=9;i>=0;i--)r.push(t[i].slice());return r}
var XQ_PP_B=xqFlip(XQ_PP),XQ_RP_B=xqFlip(XQ_RP),XQ_KP_B=xqFlip(XQ_KP),XQ_CP_B=xqFlip(XQ_CP);
function xqPV(p,r,c){
  switch(p){
    case 7:return XQ_PP[r][c];case 14:return XQ_PP_B[r][c];
    case 5:return XQ_RP[r][c];case 12:return XQ_RP_B[r][c];
    case 4:return XQ_KP[r][c];case 11:return XQ_KP_B[r][c];
    case 6:return XQ_CP[r][c];case 13:return XQ_CP_B[r][c];
    default:return 0;
  }
}
function xqEval(b){
  var s=0,rk=false,bk=false;var pieceCount={red:{},blk:{}};
  for(var r=0;r<10;r++)for(var c=0;c<9;c++){
    var p=b[r][c];if(p===0)continue;
    var v=XV[p]+xqPV(p,r,c);
    if(p===7&&r<=4)v+=curDiff>=4?50:30;if(p===14&&r>=5)v+=curDiff>=4?50:30;
    if(p===7&&r<=2)v+=20;if(p===14&&r>=7)v+=20;
    if(xqRedP(p)){s+=v;if(p===1)rk=true;pieceCount.red[p]=(pieceCount.red[p]||0)+1}
    else{s-=v;if(p===8)bk=true;pieceCount.blk[p]=(pieceCount.blk[p]||0)+1}
  }
  if(!rk)return-99999;if(!bk)return 99999;
  var totalRed=0,totalBlk=0;
  for(var k in pieceCount.red){if(k!=='1')totalRed+=pieceCount.red[k]}
  for(var k in pieceCount.blk){if(k!=='8')totalBlk+=pieceCount.blk[k]}
  var isEndgame=totalRed+totalBlk<=10;
  if(isEndgame){
    if(pieceCount.red[7])s+=pieceCount.red[7]*30;if(pieceCount.blk[14])s-=pieceCount.blk[14]*30;
    if(pieceCount.red[2])s-=pieceCount.red[2]*20;if(pieceCount.red[3])s-=pieceCount.red[3]*20;
    if(pieceCount.blk[9])s+=pieceCount.blk[9]*20;if(pieceCount.blk[10])s+=pieceCount.blk[10]*20;
    s+=(pieceCount.red[5]||0)*15;s-=(pieceCount.blk[12]||0)*15;
  }
  var redOff=(pieceCount.red[5]||0)+(pieceCount.red[4]||0)+(pieceCount.red[6]||0);
  var blkOff=(pieceCount.blk[12]||0)+(pieceCount.blk[11]||0)+(pieceCount.blk[13]||0);
  if(redOff>=3)s+=25;if(blkOff>=3)s-=25;
  var rk2=xqKing(b,true),bk2=xqKing(b,false);
  if(rk2){
    if(rk2[0]===7&&rk2[1]===4)s-=20;if(rk2[0]===9&&rk2[1]===4)s-=8;
    var guards=0;if(b[rk2[0]-1]&&b[rk2[0]-1][rk2[1]]===2)guards++;
    if(rk2[1]>0&&b[rk2[0]][rk2[1]-1]===2)guards++;if(rk2[1]<8&&b[rk2[0]][rk2[1]+1]===2)guards++;
    s+=guards*8;
  }
  if(bk2){
    if(bk2[0]===2&&bk2[1]===4)s+=20;if(bk2[0]===0&&bk2[1]===4)s+=8;
    var bguards=0;if(b[bk2[0]+1]&&b[bk2[0]+1][bk2[1]]===9)bguards++;
    if(bk2[1]>0&&b[bk2[0]][bk2[1]-1]===9)bguards++;if(bk2[1]<8&&b[bk2[0]][bk2[1]+1]===9)bguards++;
    s-=bguards*8;
  }
  for(var r2=0;r2<10;r2++){
    if(b[r2][4]===6){var frames=0;for(var r3=r2+1;r3<10;r3++)if(b[r3][4]!==0)frames++;if(frames>=1)s+=12}
    if(b[r2][4]===13){var frames2=0;for(var r3=r2-1;r3>=0;r3--)if(b[r3][4]!==0)frames2++;if(frames2>=1)s-=12}
  }
  for(var r4=0;r4<10;r4++)for(var c4=0;c4<9;c4++){
    var p2=b[r4][c4];
    if(p2===4){if(r4>0&&b[r4-1][c4]!==0)s-=10;if(r4<=1||r4>=8)s-=6;if(r4>=3&&r4<=6&&c4>=3&&c4<=5)s+=8}
    if(p2===11){if(r4<9&&b[r4+1][c4]!==0)s+=10;if(r4<=1||r4>=8)s+=6;if(r4>=3&&r4<=6&&c4>=3&&c4<=5)s-=8}
  }
  for(var c5=0;c5<9;c5++){
    var redRook=false,blkRook=false,blockers=0;
    for(var r5=0;r5<10;r5++){if(b[r5][c5]===5)redRook=true;else if(b[r5][c5]===12)blkRook=true;else if(b[r5][c5]!==0)blockers++}
    if(redRook&&blockers<=2)s+=10;if(blkRook&&blockers<=2)s-=10;
    if(redRook){for(var r6=0;r6<10;r6++)if(b[r6][c5]===5&&r6===4)s+=6}
    if(blkRook){for(var r7=0;r7<10;r7++)if(b[r7][c5]===12&&r7===5)s-=6}
  }
  if(curDiff>=4){
    for(var r8=0;r8<10;r8++){if(b[r8][4]===5)s+=8;if(b[r8][4]===12)s-=8}
    var rookCols={};
    for(var r9=0;r9<10;r9++)for(var c9=0;c9<9;c9++){if(b[r9][c9]===5)rookCols[c9]=(rookCols[c9]||0)+1;if(b[r9][c9]===12)rookCols[c9]=(rookCols[c9]||0)-1}
    for(var ck in rookCols){if(rookCols[ck]>=2)s-=12;if(rookCols[ck]<=-2)s+=12}
  }
  return s;
}
function xqOrderMoves(moves,ttMove,ply){
  for(var i=0;i<moves.length;i++){
    var m=moves[i],score=0;
    if(ttMove&&m.fr===ttMove.fr&&m.fc===ttMove.fc&&m.tr===ttMove.tr&&m.tc===ttMove.tc)score+=100000;
    if(m.captured!==0)score+=10000+XV[m.captured]*10-XV[m.piece];
    if(xqKiller[ply]){for(var k=0;k<xqKiller[ply].length;k++){var km=xqKiller[ply][k];if(km&&m.fr===km.fr&&m.fc===km.fc&&m.tr===km.tr&&m.tc===km.tc){score+=9000;break}}}
    score+=xqHist2[m.fr*9+m.fc]&&xqHist2[m.fr*9+m.fc][m.tr*9+m.tc]||0;
    m.score=score;
  }
  moves.sort(function(a,b){return b.score-a.score});
}
function xqQ(b,alpha,beta,red,qply){
  qply=qply||0;xqNodes++;
  if(xqAbort||(xqNodes&2047)===0&&Date.now()-xqStart>(curDiff>=4?15000:6000)){xqAbort=true;return 0}
  if(qply>=8)return xqEval(b)*(red?1:-1);
  var stand=xqEval(b);if(!red)stand=-stand;
  if(stand>=beta)return beta;if(stand>alpha)alpha=stand;
  var all=xqGen(b,red),caps=[];
  for(var i=0;i<all.length;i++)if(all[i].captured!==0)caps.push(all[i]);
  caps.sort(function(a,b2){return(XV[b2.captured]*10-XV[b2.piece])-(XV[a.captured]*10-XV[a.piece])});
  for(var i=0;i<caps.length;i++){
    var m=caps[i],nb=b.map(function(r){return r.slice()});
    nb[m.tr][m.tc]=nb[m.fr][m.fc];nb[m.fr][m.fc]=0;
    if(xqCheck(nb,red))continue;
    var sc=-xqQ(nb,-beta,-alpha,!red,qply+1);if(xqAbort)return 0;
    if(sc>=beta)return beta;if(sc>alpha)alpha=sc;
  }
  return alpha;
}
function xqPVS(b,depth,alpha,beta,red,ply){
  xqNodes++;
  if(xqAbort||(xqNodes&2047)===0&&Date.now()-xqStart>(curDiff>=4?15000:6000)){xqAbort=true;return 0}
  var h=xqH(b,red),tt=xqTT.get(h);
  if(tt&&tt.depth>=depth){if(tt.flag===0)return tt.score;if(tt.flag===1&&tt.score>=beta)return tt.score;if(tt.flag===2&&tt.score<=alpha)return tt.score}
  var inCheck=xqCheck(b,red);if(inCheck&&ply<60)depth++;
  if(ply>=64)return xqEval(b)*(red?1:-1);
  if(depth<=0)return xqQ(b,alpha,beta,red);
  var R=curDiff>=4?3:2;
  if(depth>=R&&!inCheck&&ply<60){var ns=-xqPVS(b,depth-1-R,-beta,-beta+1,!red,ply+1);if(ns>=beta)return beta}
  var moves=xqLegalMoves(b,red);if(moves.length===0)return red?-99000-depth:99000+depth;
  var ttMove=tt?tt.bm:null;xqOrderMoves(moves,ttMove,ply);
  var bm=null,oa=alpha,first=true;
  for(var i=0;i<moves.length;i++){
    var m=moves[i],nb=b.map(function(r){return r.slice()});
    nb[m.tr][m.tc]=nb[m.fr][m.fc];nb[m.fr][m.fc]=0;
    var sc;
    if(first){sc=-xqPVS(nb,depth-1,-beta,-alpha,!red,ply+1)}
    else{
      var reduction=0;
      if(curDiff>=4){if(i>=6&&depth>=4&&m.captured===0)reduction=2;else if(i>=3&&depth>=3&&m.captured===0)reduction=1}
      else if(i>=4&&depth>=3&&m.captured===0)reduction=1;
      sc=-xqPVS(nb,depth-1-reduction,-alpha-1,-alpha,!red,ply+1);
      if(sc>alpha&&reduction>0)sc=-xqPVS(nb,depth-1,-beta,-alpha,!red,ply+1);
    }
    if(xqAbort)return 0;
    if(sc>=beta){
      if(m.captured===0){
        if(!xqKiller[ply])xqKiller[ply]=[];var isKiller=false;
        for(var k=0;k<xqKiller[ply].length;k++){if(xqKiller[ply][k]&&xqKiller[ply][k].fr===m.fr&&xqKiller[ply][k].fc===m.fc&&xqKiller[ply][k].tr===m.tr&&xqKiller[ply][k].tc===m.tc){isKiller=true;break}}
        if(!isKiller){if(xqKiller[ply].length<2)xqKiller[ply].push(m);else{xqKiller[ply][1]=xqKiller[ply][0];xqKiller[ply][0]=m}}
        if(!xqHist2[m.fr*9+m.fc])xqHist2[m.fr*9+m.fc]=[];
        xqHist2[m.fr*9+m.fc][m.tr*9+m.tc]=(xqHist2[m.fr*9+m.fc][m.tr*9+m.tc]||0)+depth*depth;
      }
      xqTT.set(h,{depth:depth,score:sc,flag:1,bm:m});return sc;
    }
    if(sc>alpha){alpha=sc;bm=m;first=false}
  }
  var flag=alpha>oa?0:2;xqTT.set(h,{depth:depth,score:alpha,flag:flag,bm:bm});return alpha;
}
var XQ_OPENINGS=[
  [{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:0,fc:1,tr:2,tc:2,piece:11,captured:0},{fr:9,fc:7,tr:7,tc:6,piece:4,captured:0},{fr:0,fc:7,tr:2,tc:6,piece:11,captured:0}],
  [{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:0,fc:1,tr:2,tc:2,piece:11,captured:0},{fr:9,fc:7,tr:7,tc:6,piece:4,captured:0},{fr:0,fc:7,tr:2,tc:6,piece:11,captured:0},{fr:9,fc:1,tr:7,tc:2,piece:4,captured:0},{fr:0,fc:0,tr:1,tc:0,piece:12,captured:0}],
  [{fr:6,fc:4,tr:6,tc:4,piece:7,captured:0},{fr:3,fc:4,tr:3,tc:4,piece:14,captured:0}],
  [{fr:6,fc:4,tr:6,tc:4,piece:7,captured:0},{fr:3,fc:4,tr:3,tc:4,piece:14,captured:0},{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:1,fc:7,tr:3,tc:7,piece:13,captured:0}],
  [{fr:9,fc:2,tr:7,tc:4,piece:3,captured:0},{fr:0,fc:2,tr:2,tc:4,piece:10,captured:0}],
  [{fr:9,fc:2,tr:7,tc:4,piece:3,captured:0},{fr:1,fc:1,tr:1,tc:4,piece:13,captured:0}],
  [{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:0,fc:1,tr:2,tc:2,piece:11,captured:0}],
  [{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:1,fc:1,tr:1,tc:4,piece:13,captured:0}],
  [{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:0,fc:1,tr:2,tc:2,piece:11,captured:0},{fr:9,fc:1,tr:7,tc:2,piece:4,captured:0},{fr:0,fc:7,tr:2,tc:6,piece:11,captured:0},{fr:6,fc:2,tr:6,tc:2,piece:7,captured:0}],
  [{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:0,fc:1,tr:2,tc:2,piece:11,captured:0},{fr:9,fc:7,tr:7,tc:6,piece:4,captured:0},{fr:0,fc:7,tr:2,tc:6,piece:11,captured:0},{fr:6,fc:4,tr:6,tc:4,piece:7,captured:0},{fr:1,fc:1,tr:2,tc:4,piece:13,captured:0}],
  [{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:0,fc:1,tr:2,tc:2,piece:11,captured:0},{fr:9,fc:1,tr:7,tc:2,piece:4,captured:0},{fr:3,fc:2,tr:4,tc:2,piece:14,captured:0}],
  [{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:0,fc:1,tr:2,tc:2,piece:11,captured:0},{fr:9,fc:7,tr:7,tc:6,piece:4,captured:0},{fr:0,fc:7,tr:2,tc:6,piece:11,captured:0},{fr:6,fc:2,tr:6,tc:2,piece:7,captured:0},{fr:1,fc:7,tr:3,tc:7,piece:13,captured:0}],
  [{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:1,fc:1,tr:1,tc:4,piece:13,captured:0},{fr:9,fc:1,tr:7,tc:2,piece:4,captured:0},{fr:0,fc:0,tr:1,tc:0,piece:12,captured:0}],
  [{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:1,fc:7,tr:1,tc:4,piece:13,captured:0}],
  [{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:0,fc:1,tr:2,tc:2,piece:11,captured:0},{fr:7,fc:1,tr:7,tc:2,piece:6,captured:0},{fr:0,fc:7,tr:2,tc:6,piece:11,captured:0}],
  [{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:0,fc:1,tr:2,tc:2,piece:11,captured:0},{fr:9,fc:7,tr:7,tc:6,piece:4,captured:0},{fr:0,fc:7,tr:2,tc:6,piece:11,captured:0},{fr:7,fc:1,tr:7,tc:3,piece:6,captured:0},{fr:6,fc:4,tr:6,tc:4,piece:7,captured:0}],
  [{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:0,fc:1,tr:2,tc:2,piece:11,captured:0},{fr:9,fc:7,tr:7,tc:6,piece:4,captured:0},{fr:0,fc:7,tr:2,tc:6,piece:11,captured:0},{fr:7,fc:1,tr:5,tc:3,piece:6,captured:0},{fr:6,fc:4,tr:6,tc:4,piece:7,captured:0}],
  [{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:0,fc:1,tr:2,tc:2,piece:11,captured:0},{fr:9,fc:7,tr:7,tc:6,piece:4,captured:0},{fr:0,fc:7,tr:2,tc:6,piece:11,captured:0},{fr:6,fc:2,tr:6,tc:2,piece:7,captured:0},{fr:3,fc:2,tr:4,tc:2,piece:14,captured:0},{fr:9,fc:3,tr:7,tc:5,piece:3,captured:0}],
  [{fr:7,fc:7,tr:7,tc:4,piece:6,captured:0},{fr:0,fc:1,tr:2,tc:2,piece:11,captured:0},{fr:9,fc:1,tr:7,tc:2,piece:4,captured:0},{fr:0,fc:7,tr:2,tc:6,piece:11,captured:0},{fr:9,fc:5,tr:9,tc:5,piece:5,captured:0},{fr:1,fc:7,tr:2,tc:4,piece:13,captured:0}],
  [{fr:6,fc:4,tr:6,tc:4,piece:7,captured:0},{fr:3,fc:4,tr:3,tc:4,piece:14,captured:0},{fr:9,fc:7,tr:7,tc:6,piece:4,captured:0},{fr:0,fc:1,tr:2,tc:2,piece:11,captured:0}],
  [{fr:9,fc:2,tr:7,tc:4,piece:3,captured:0},{fr:0,fc:2,tr:2,tc:4,piece:10,captured:0},{fr:9,fc:7,tr:7,tc:6,piece:4,captured:0},{fr:3,fc:2,tr:4,tc:2,piece:14,captured:0}],
  [{fr:7,fc:1,tr:7,tc:3,piece:6,captured:0},{fr:1,fc:1,tr:1,tc:4,piece:13,captured:0},{fr:9,fc:7,tr:7,tc:6,piece:4,captured:0},{fr:0,fc:1,tr:2,tc:2,piece:11,captured:0}]
];
function xqAIMove(){
  var aiRed=xqAiRed;
  if(xqHist.length<12){
    var sb=xqInitBoard(),boardMatches=true;
    for(var hi=0;hi<xqHist.length;hi++){var hm=xqHist[hi];if(sb[hm.fr][hm.fc]===0){boardMatches=false;break}sb[hm.tr][hm.tc]=sb[hm.fr][hm.fc];sb[hm.fr][hm.fc]=0}
    if(boardMatches){for(var r=0;r<10&&boardMatches;r++)for(var c=0;c<9&&boardMatches;c++){if(xqB[r][c]!==sb[r][c])boardMatches=false}}
    if(boardMatches){
      for(var oi=0;oi<XQ_OPENINGS.length;oi++){
        var ops=XQ_OPENINGS[oi];if(xqHist.length>=ops.length)continue;
        var match=true;
        for(var hi2=0;hi2<xqHist.length;hi2++){if(xqHist[hi2].fr!==ops[hi2].fr||xqHist[hi2].fc!==ops[hi2].fc||xqHist[hi2].tr!==ops[hi2].tr||xqHist[hi2].tc!==ops[hi2].tc){match=false;break}}
        if(match){
          var om=ops[xqHist.length];var lg=xqLegalMoves(xqB,aiRed);
          for(var i=0;i<lg.length;i++){if(lg[i].fr===om.fr&&lg[i].fc===om.fc&&lg[i].tr===om.tr&&lg[i].tc===om.tc){showAIInfo('开局库 第'+(xqHist.length+1)+'手');return lg[i]}}
        }
      }
    }
  }
  xqNodes=0;xqStart=Date.now();xqAbort=false;xqTT=new Map();xqKiller=new Array(20);xqHist2=[];
  for(var i=0;i<90;i++)xqHist2.push([]);
  var moves=xqLegalMoves(xqB,aiRed);if(moves.length===0)return null;
  var best=moves[0],bestScore=-Infinity;
  var maxDepth=curDiff===1?4:curDiff===2?6:curDiff===3?8:14;
  var d=1;
  for(d=1;d<=maxDepth;d++){
    if(xqAbort)break;
    var cands=[],ds=-Infinity,al=-Infinity;
    var ttMove=null;var h=xqH(xqB,aiRed),tt=xqTT.get(h);if(tt&&tt.bm)ttMove=tt.bm;
    xqOrderMoves(moves,ttMove,0);
    for(var i=0;i<moves.length;i++){
      var m=moves[i],nb=xqB.map(function(r){return r.slice()});
      nb[m.tr][m.tc]=nb[m.fr][m.fc];nb[m.fr][m.fc]=0;
      var sc,fullSearched=false;
      if(i===0){sc=-xqPVS(nb,d-1,-Infinity,Infinity,!aiRed,1);fullSearched=true}
      else{sc=-xqPVS(nb,d-1,-al-1,-al,!aiRed,1);if(sc>al&&!xqAbort){sc=-xqPVS(nb,d-1,-Infinity,Infinity,!aiRed,1);fullSearched=true}}
      if(xqAbort)break;if(curDiff<=2)sc+=Math.random()*4-2;
      if(fullSearched){if(sc>ds+0.5){ds=sc;cands=[m]}else if(Math.abs(sc-ds)<3)cands.push(m)}
      if(sc>al)al=sc;
    }
    if(!xqAbort&&cands.length>0){best=cands[Math.floor(Math.random()*cands.length)];bestScore=ds}
    if(Math.abs(ds)>98900)break;
  }
  var info='搜索 深度'+(d-1)+' 节点'+xqNodes;
  if(bestScore>90000)info+=' [优势]';else if(bestScore<-90000)info+=' [劣势]';
  showAIInfo(info);
  var wr=scoreToWinRate(bestScore);showWinRate(playerFirst?(100-wr):wr);
  return best;
}
function drawXQ(){
  var tex=makeWoodTexture(XW,XH,98765);cx.drawImage(tex,0,0);
  cx.strokeStyle='#5c4a32';cx.lineWidth=2.5;cx.strokeRect(XP-10,XP-10,8*XC+20,9*XC+20);
  cx.strokeStyle='rgba(92,74,50,.5)';cx.lineWidth=1;cx.strokeRect(XP-5,XP-5,8*XC+10,9*XC+10);
  cx.lineWidth=1;cx.strokeStyle='#5c4a32';
  for(var c=0;c<9;c++){
    if(c===0||c===8){cx.beginPath();cx.moveTo(XP+c*XC,XP);cx.lineTo(XP+c*XC,XP+9*XC);cx.stroke()}
    else{cx.beginPath();cx.moveTo(XP+c*XC,XP);cx.lineTo(XP+c*XC,XP+4*XC);cx.stroke();cx.beginPath();cx.moveTo(XP+c*XC,XP+5*XC);cx.lineTo(XP+c*XC,XP+9*XC);cx.stroke()}
  }
  for(var r=0;r<10;r++){cx.beginPath();cx.moveTo(XP,XP+r*XC);cx.lineTo(XP+8*XC,XP+r*XC);cx.stroke()}
  cx.lineWidth=.9;
  cx.beginPath();cx.moveTo(XP+3*XC,XP);cx.lineTo(XP+5*XC,XP+2*XC);cx.moveTo(XP+5*XC,XP);cx.lineTo(XP+3*XC,XP+2*XC);
  cx.moveTo(XP+3*XC,XP+7*XC);cx.lineTo(XP+5*XC,XP+9*XC);cx.moveTo(XP+5*XC,XP+7*XC);cx.lineTo(XP+3*XC,XP+9*XC);cx.stroke();
  cx.fillStyle='rgba(60,45,25,.5)';cx.font='600 22px '+FF_SERIF;cx.textAlign='center';cx.textBaseline='middle';
  cx.fillText('楚  河',XP+2*XC,XP+4.5*XC);cx.fillText('漢  界',XP+6*XC,XP+4.5*XC);
  cx.strokeStyle='rgba(92,74,50,.4)';cx.lineWidth=.8;
  var marks=[[2,1],[2,7],[3,0],[3,2],[3,4],[3,6],[3,8],[7,1],[7,7],[6,0],[6,2],[6,4],[6,6],[6,8]];
  for(var i=0;i<marks.length;i++){
    var mx=XP+marks[i][1]*XC,my=XP+marks[i][0]*XC,s=4;
    if(marks[i][1]>0){cx.beginPath();cx.moveTo(mx-s-3,my);cx.lineTo(mx-3,my);cx.moveTo(mx-3,my-s-3);cx.lineTo(mx-3,my-3);cx.stroke()}
    if(marks[i][1]<8){cx.beginPath();cx.moveTo(mx+3,my);cx.lineTo(mx+s+3,my);cx.moveTo(mx+3,my-3);cx.lineTo(mx+3,my-s-3);cx.stroke()}
    if(marks[i][1]>0){cx.beginPath();cx.moveTo(mx-3,my+3);cx.lineTo(mx-3,my+s+3);cx.moveTo(mx-s-3,my);cx.lineTo(mx-3,my);cx.stroke();cx.moveTo(mx-3,my+3);cx.lineTo(mx-s-3,my+3)}
    if(marks[i][1]<8){cx.beginPath();cx.moveTo(mx+3,my+3);cx.lineTo(mx+s+3,my);cx.moveTo(mx+3,my+3);cx.lineTo(mx+3,my+s+3)}
  }
  for(var r=0;r<10;r++)for(var c=0;c<9;c++)if(xqB[r][c]!==0)drawXQP(XP+c*XC,XP+r*XC,xqB[r][c]);
  if(xqSel){
    cx.strokeStyle='rgba(200,140,50,.85)';cx.lineWidth=3;cx.beginPath();cx.arc(XP+xqSel[1]*XC,XP+xqSel[0]*XC,25,0,Math.PI*2);cx.stroke();
    for(var i=0;i<xqLegal.length;i++){
      var m=xqLegal[i],px=XP+m.tc*XC,py=XP+m.tr*XC;
      if(m.captured!==0){cx.strokeStyle='rgba(156,42,42,.55)';cx.lineWidth=3;cx.beginPath();cx.arc(px,py,25,0,Math.PI*2);cx.stroke()}
      else{cx.fillStyle='rgba(90,122,82,.4)';cx.beginPath();cx.arc(px,py,8,0,Math.PI*2);cx.fill()}
    }
  }
  requestRender();
}
function drawXQP(px,py,p){
  var red=xqRedP(p),r=24;
  cx.save();cx.shadowColor='rgba(0,0,0,.45)';cx.shadowBlur=8;cx.shadowOffsetX=2;cx.shadowOffsetY=4;
  var bg=cx.createRadialGradient(px-r*.3,py-r*.3,r*.1,px+r*.05,py+r*.05,r*1.05);
  bg.addColorStop(0,'#fff8e8');bg.addColorStop(.2,'#f5e4b8');bg.addColorStop(.5,'#e8cc88');bg.addColorStop(.8,'#d4b060');bg.addColorStop(1,'#b8923c');
  cx.fillStyle=bg;cx.beginPath();cx.arc(px,py,r,0,Math.PI*2);cx.fill();cx.restore();
  cx.strokeStyle='#8a6428';cx.lineWidth=1.5;cx.beginPath();cx.arc(px,py,r-0.5,0,Math.PI*2);cx.stroke();
  cx.strokeStyle=red?'rgba(154,48,48,.65)':'rgba(40,35,30,.65)';cx.lineWidth=1.2;cx.beginPath();cx.arc(px,py,r-3,0,Math.PI*2);cx.stroke();
  cx.strokeStyle=red?'rgba(154,48,48,.35)':'rgba(40,35,30,.35)';cx.lineWidth=.8;cx.beginPath();cx.arc(px,py,r-5.5,0,Math.PI*2);cx.stroke();
  cx.save();cx.globalAlpha=.04;cx.strokeStyle='#6b4226';cx.lineWidth=.3;for(var i=0;i<3;i++){cx.beginPath();cx.arc(px,py,r-2-i*4,0,Math.PI*2);cx.stroke()}cx.restore();
  cx.save();
  var hg=cx.createLinearGradient(px,py-r,px,py);
  hg.addColorStop(0,'rgba(255,255,255,.4)');hg.addColorStop(1,'rgba(255,255,255,0)');
  cx.fillStyle=hg;cx.beginPath();cx.arc(px,py,r-1,Math.PI*1.15,Math.PI*1.85);cx.arc(px,py,r-4,Math.PI*1.85,Math.PI*1.15,true);cx.fill();cx.restore();
  cx.textAlign='center';cx.textBaseline='middle';var fontSize=22;
  cx.fillStyle='rgba(0,0,0,.15)';cx.font='900 '+fontSize+'px '+FF_SERIF;cx.fillText(XC_H[p],px+1,py+2);
  cx.fillStyle=red?'#b82828':'#1c1815';cx.fillText(XC_H[p],px,py+1);
  cx.save();cx.globalAlpha=.15;cx.fillStyle='#fff';cx.fillText(XC_H[p],px-0.5,py-0.5);cx.restore();
}
function xqPlay(r,c){
  var playerIsRed=playerFirst;
  if(xqOver||xqAi)return;
  if(playerIsRed&&!xqRed)return;if(!playerIsRed&&xqRed)return;
  if(xqSel){
    var m=null;for(var i=0;i<xqLegal.length;i++)if(xqLegal[i].tr===r&&xqLegal[i].tc===c){m=xqLegal[i];break}
    if(m){
      xqB[m.tr][m.tc]=xqB[m.fr][m.fc];xqB[m.fr][m.fc]=0;xqHist.push(m);xqSel=null;xqLegal=[];xqRed=!xqRed;drawXQ();xqUpdM();
      var om=xqLegalMoves(xqB,xqAiRed);if(om.length===0){addS('w');showOver('胜','将死对手','win');return}
      var ck=xqCheck(xqB,xqAiRed)?' 将军':'';
      thinking=true;statusText='思考中';statusColor=COL.red;checkText=ck;xqAi=true;requestRender();
      var _gt=gameToken;
      setTimeout(function(){
        if(gameToken!==_gt)return;
        var bm=xqAIMove();xqAi=false;thinking=false;checkText='';
        if(bm){xqB[bm.tr][bm.tc]=xqB[bm.fr][bm.fc];xqB[bm.fr][bm.fc]=0;xqHist.push(bm)}
        xqRed=!xqAiRed;drawXQ();xqUpdM();
        var mm=xqLegalMoves(xqB,playerIsRed);if(mm.length===0){addS('l');showOver('负','你被将死了','lose');return}
        var mc=xqCheck(xqB,playerIsRed)?' 你被将军':'';
        statusText='你的回合'+mc;statusColor=COL.accent;requestRender();
      },50);return;
    }
    xqSel=null;xqLegal=[];drawXQ();
  }
  var p=xqB[r][c];var canSelect=playerIsRed?xqRedP(p):!xqRedP(p);
  if(p!==0&&canSelect){xqSel=[r,c];xqLegal=xqLegalMoves(xqB,playerIsRed).filter(function(m){return m.fr===r&&m.fc===c});drawXQ()}
}
function xqUpdM(){
  var col='abcdefghi',parts=[];
  for(var i=0;i<xqHist.length;i++){
    var m=xqHist[i],n=Math.floor(i/2)+1,red=xqRedP(m.piece),ch=XC_H[m.piece];
    var f=col[m.fc]+(10-m.fr),t=col[m.tc]+(10-m.tr);
    var pf=i%2===0?(n+'. '):'  ';
    parts.push(pf+ch+' '+f+'>'+t);
  }
  moveListText=parts.join('  ');requestRender();
}
// ============================================================
//  Part 4: 状态显示 / 事件处理 / 回放 / 渲染 / 触摸 / 启动
// ============================================================
var gameToken=0;

// ---------- 状态显示 ----------
function showOver(title,text,cls){
  over=true;overTitle=title;overText=text;overClass=cls;
  if(cls==='win')winRatePct=100;else if(cls==='lose')winRatePct=0;
  requestRender();
}
function hideOver(){over=false;overTitle='';overText='';overClass=''}
function showAIInfo(text){aiInfoText=text||'';requestRender()}
function showWinRate(pct){winRatePct=Math.round(pct);winRateVisible=true;requestRender()}
function scoreToWinRate(score){
  var wr=100/(1+Math.exp(-score/300));
  return Math.max(1,Math.min(99,Math.round(wr)));
}

// ---------- 棋盘点击 ----------
function handleClick(mx,my){
  if(appState!==STATE_GAME||over||thinking)return;
  var bx=(mx-L.boardX)/L.scale,by=(my-L.boardY)/L.scale;
  if(curGame==='gomoku'){
    var gx=Math.round((bx-GP)/GC),gy=Math.round((by-GP)/GC);
    if(gx<0||gx>=GS||gy<0||gy>=GS)return;
    var dx=bx-(GP+gx*GC),dy=by-(GP+gy*GC);
    if(dx*dx+dy*dy>GC*0.45*GC*0.45)return;
    gomokuPlay(gx,gy);
  }else if(curGame==='go'){
    var gx=Math.round((bx-GOP)/GOC),gy=Math.round((by-GOP)/GOC);
    if(gx<0||gx>=GSZ||gy<0||gy>=GSZ)return;
    var dx=bx-(GOP+gx*GOC),dy=by-(GOP+gy*GOC);
    if(dx*dx+dy*dy>GOC*0.45*GOC*0.45)return;
    goPlay(gx,gy);
  }else if(curGame==='xiangqi'){
    var c=Math.round((bx-XP)/XC),r=Math.round((by-XP)/XC);
    if(r<0||r>=10||c<0||c>=9)return;
    var dx=bx-(XP+c*XC),dy=by-(XP+r*XC);
    if(dx*dx+dy*dy>XC*0.48*XC*0.48)return;
    xqPlay(r,c);
  }
}

// ---------- 进入/退出游戏 ----------
function enter(g){
  goAbort=true;gAbort=true;xqAbort=true;
  goAi=false;gAiThink=false;xqAi=false;thinking=false;
  gameToken++;
  curGame=g;appState=STATE_GAME;hideOver();
  if(rpAutoTimer){clearInterval(rpAutoTimer);rpAutoTimer=null}
  if(g==='gomoku'){titleText='五子棋';footerText='黑先 · 连五为胜';initGomoku();computeLayout();requestRender()}
  else if(g==='xiangqi'){titleText='象棋';footerText='红先 · 将死为胜';initXQ();computeLayout();requestRender()}
  else if(g==='go'){
    titleText='围棋';footerText='黑先 · 数子法';
    statusText='准备中';statusColor=COL.inkS;
    computeLayout();requestRender();
    var _gt=gameToken;
    setTimeout(function(){
      if(gameToken!==_gt)return;
      initGo();computeLayout();requestRender();
    },20);
  }
}
function exit(){
  goAbort=true;gAbort=true;xqAbort=true;
  goAi=false;gAiThink=false;xqAi=false;thinking=false;
  if(rpAutoTimer){clearInterval(rpAutoTimer);rpAutoTimer=null}
  appState=STATE_MENU;requestRender();
}

// ---------- 动作函数 ----------
function actRestart(){goAbort=true;gAbort=true;xqAbort=true;enter(curGame)}
function actBack(){exit()}

function actUndo(){
  if(over||thinking)return;
  if(curGame==='gomoku'){
    if(gH.length<2)return;
    gH.pop();gH.pop();
    gB=[];for(var i=0;i<GS;i++)gB.push(new Array(GS).fill(0));
    for(var i=0;i<gH.length;i++)gB[gH[i].y][gH[i].x]=gH[i].p;
    gLast=gH.length>0?gH[gH.length-1]:null;
    gCur=playerFirst?1:2;gAiThink=false;drawGomoku();updSt();
  }else if(curGame==='go'){
    if(goHist.length<2||goAi)return;
    goHist.pop();goHist.pop();
    goB=[];for(var i=0;i<GSZ;i++)goB.push(new Array(GSZ).fill(0));
    goKo=null;goLast=null;goPass=0;goCaps=[0,0];
    for(var i=0;i<goHist.length;i++){
      var m=goHist[i],r=goTry(goB,m.x,m.y,m.c,goKo);
      if(r.valid){goB=r.newBoard;goKo=r.newKo;goLast=m;
        if(r.captured.length>0)goCaps[m.c===1?0:1]+=r.captured.length}
    }
    goCur=playerFirst?1:2;goAi=false;drawGo();
    statusText='请落子';statusColor=COL.accent;requestRender();
  }else if(curGame==='xiangqi'){
    if(xqHist.length<2||xqAi)return;
    xqHist.pop();xqHist.pop();
    xqB=xqInitBoard();
    for(var i=0;i<xqHist.length;i++){var m=xqHist[i];xqB[m.tr][m.tc]=xqB[m.fr][m.fc];xqB[m.fr][m.fc]=0}
    xqSel=null;xqLegal=[];xqRed=playerFirst;xqAi=false;drawXQ();xqUpdM();
    statusText='你的回合';statusColor=COL.accent;requestRender();
  }
}

function actPass(){
  if(curGame!=='go'||goOver||goAi)return;
  var playerColor=playerFirst?1:2;
  if(goCur!==playerColor)return;
  goPass++;goLast=null;
  if(goPass>=2){goEnd();return}
  var aiColor=playerFirst?2:1;
  goCur=aiColor;thinking=true;statusText='思考中';statusColor=COL.red;
  goAi=true;goAbort=false;requestRender();
  var _gt=gameToken;
  goMCTS(goB,aiColor,goKo,function(m){
    if(gameToken!==_gt)return;
    goAi=false;thinking=false;if(goAbort)return;
    if(!m){goPass++;if(goPass>=2){goEnd();return}
      goCur=playerColor;statusText='请落子';statusColor=COL.accent;requestRender();return}
    var r2=goTry(goB,m.move[0],m.move[1],aiColor,goKo);
    if(r2.valid){goB=r2.newBoard;goKo=r2.newKo;goLast={x:m.move[0],y:m.move[1],c:aiColor};
      goHist.push({x:m.move[0],y:m.move[1],c:aiColor});
      if(r2.captured.length>0)goCaps[playerFirst?1:0]+=r2.captured.length;drawGo()}
    goPass=0;goCur=playerColor;statusText='请落子';statusColor=COL.accent;requestRender();
  });
}

function actResign(){
  if(over)return;
  if(curGame==='go'&&goOver)return;
  if(curGame==='xiangqi'&&xqOver)return;
  addS('l');showOver('负','你认输了','lose');
}

function actSave(){
  var moves=[];
  if(curGame==='gomoku')moves=gH.map(function(m){return{x:m.x,y:m.y,p:m.p}});
  else if(curGame==='go')moves=goHist.map(function(m){return{x:m.x,y:m.y,c:m.c}});
  else if(curGame==='xiangqi')moves=xqHist.map(function(m){return{fr:m.fr,fc:m.fc,tr:m.tr,tc:m.tc,piece:m.piece}});
  var d=new Date();
  var dt=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  var rep={id:Date.now(),game:curGame,date:dt,result:overClass,moves:moves,first:playerFirst,diff:curDiff};
  var list=getReplays();list.unshift(rep);if(list.length>50)list=list.slice(0,50);
  saveReplays(list);
  try{wx.showToast({title:'已保存',icon:'success',duration:1500})}catch(e){}
}
function actReplayList(){goAbort=true;gAbort=true;xqAbort=true;appState=STATE_RPLIST;scrollY=0;requestRender()}

// ---------- 回放 ----------
function getReplays(){try{return JSON.parse(lsGet('replays')||'[]')}catch(e){return[]}}
function saveReplays(list){lsSet('replays',JSON.stringify(list))}
var rpAutoTimer=null;
function openRPViewer(idx){
  var list=getReplays();if(idx<0||idx>=list.length)return;
  replayData=list[idx];replayStep=0;appState=STATE_RPVIEW;
  curGame=replayData.game;playerFirst=replayData.first;
  if(curGame==='gomoku'){cv.width=GX;cv.height=GX;cx=cv.getContext('2d');
    gB=[];for(var i=0;i<GS;i++)gB.push(new Array(GS).fill(0));gLast=null;drawGomoku()}
  else if(curGame==='go'){cv.width=GOSZ;cv.height=GOSZ;cx=cv.getContext('2d');
    goB=[];for(var i=0;i<GSZ;i++)goB.push(new Array(GSZ).fill(0));goLast=null;drawGo()}
  else if(curGame==='xiangqi'){cv.width=XW;cv.height=XH;cx=cv.getContext('2d');
    xqB=xqInitBoard();xqSel=null;xqLegal=[];drawXQ()}
  computeLayout();requestRender();
}
function closeRPViewer(){
  if(rpAutoTimer){clearInterval(rpAutoTimer);rpAutoTimer=null}
  replayData=null;appState=STATE_RPLIST;requestRender();
}
function rpRebuildTo(step){
  replayStep=step;
  if(!replayData)return;
  if(replayData.game==='gomoku'){
    gB=[];for(var i=0;i<GS;i++)gB.push(new Array(GS).fill(0));gLast=null;
    for(var i=0;i<step&&i<replayData.moves.length;i++){var m=replayData.moves[i];gB[m.y][m.x]=m.p;gLast=m}
    drawGomoku();
  }else if(replayData.game==='go'){
    goB=[];for(var i=0;i<GSZ;i++)goB.push(new Array(GSZ).fill(0));goKo=null;goLast=null;
    for(var i=0;i<step&&i<replayData.moves.length;i++){var m=replayData.moves[i];var r=goTry(goB,m.x,m.y,m.c,goKo);
      if(r.valid){goB=r.newBoard;goKo=r.newKo;goLast=m}}
    drawGo();
  }else if(replayData.game==='xiangqi'){
    xqB=xqInitBoard();
    for(var i=0;i<step&&i<replayData.moves.length;i++){var m=replayData.moves[i];xqB[m.tr][m.tc]=xqB[m.fr][m.fc];xqB[m.fr][m.fc]=0}
    xqSel=null;xqLegal=[];drawXQ();
  }
  requestRender();
}
function rpStep(dir){
  if(!replayData)return;
  var total=replayData.moves.length;
  var ns=replayStep+dir;
  if(ns<0)ns=0;if(ns>total)ns=total;
  rpRebuildTo(ns);
}
function rpAutoPlay(){
  if(rpAutoTimer){clearInterval(rpAutoTimer);rpAutoTimer=null;requestRender();return}
  rpAutoTimer=setInterval(function(){
    if(!replayData||replayStep>=replayData.moves.length){
      clearInterval(rpAutoTimer);rpAutoTimer=null;requestRender();return}
    rpStep(1);
  },800);
  requestRender();
}
function delReplay(idx){
  var list=getReplays();if(idx<0||idx>=list.length)return;
  try{
    wx.showModal({title:'删除棋谱',content:'确定删除这盘棋谱吗？',success:function(res){
      if(res.confirm){list.splice(idx,1);saveReplays(list);requestRender()}
    }});
  }catch(e){list.splice(idx,1);saveReplays(list);requestRender()}
}

// ---------- 辅助 ----------
function getGameButtons(){
  if(curGame==='gomoku')return[{label:'重开',action:actRestart},{label:'悔棋',action:actUndo},{label:'认输',action:actResign},{label:'存谱',action:actSave},{label:'棋谱',action:actReplayList}];
  if(curGame==='go')return[{label:'重开',action:actRestart},{label:'虚手',action:actPass},{label:'认输',action:actResign},{label:'存谱',action:actSave},{label:'棋谱',action:actReplayList}];
  if(curGame==='xiangqi')return[{label:'重开',action:actRestart},{label:'悔棋',action:actUndo},{label:'认输',action:actResign},{label:'存谱',action:actSave},{label:'棋谱',action:actReplayList}];
  return[];
}
function isUndoDisabled(){
  if(curGame==='gomoku')return gH.length<2;
  if(curGame==='go')return goHist.length<2;
  if(curGame==='xiangqi')return xqHist.length<2;
  return true;
}
function isPassDisabled(){
  if(curGame!=='go')return true;
  return goOver||goAi||goCur!==(playerFirst?1:2);
}
function drawOverModal(ctx){
  ctx.fillStyle='rgba(28,25,23,0.55)';
  ctx.fillRect(0,0,SW,SH);
  var cw=Math.min(SW-64,300),ch=170;
  var cx2=(SW-cw)/2,cy2=(SH-ch)/2;
  ctx.fillStyle=COL.paper;
  roundRect(ctx,cx2,cy2,cw,ch,12);ctx.fill();
  ctx.strokeStyle=COL.paperD;ctx.lineWidth=1;ctx.stroke();
  var tc=overClass==='win'?COL.green:(overClass==='lose'?COL.red:COL.gold);
  setText(ctx,'600 38px '+FF_SERIF,tc,'center','middle');
  ctx.fillText(overTitle,SW/2,cy2+50);
  setText(ctx,'14px '+FF,COL.inkS,'center','middle');
  ctx.fillText(overText,SW/2,cy2+88);
  var btnW=(cw-36)/2,btnH=36,btnY=cy2+ch-50;
  drawButton(cx2+12,btnY,btnW,btnH,'再来一局',{fontSize:13});
  addRegion(cx2+12,btnY,btnW,btnH,function(){actRestart()});
  drawButton(cx2+24+btnW,btnY,btnW,btnH,'返回菜单',{dark:true,fontSize:13});
  addRegion(cx2+24+btnW,btnY,btnW,btnH,function(){exit()});
}

// ---------- 布局计算 ----------
function computeLayout(){
  var pad=8;
  L.topH=40;L.btnH=30;L.btnGap=5;L.infoH=54;
  var maxBW=SW-pad*2;
  var maxBH=SH-L.topH-L.infoH-L.btnH-pad*4;
  if(cv.width>0&&cv.height>0){
    L.scale=Math.min(maxBW/cv.width,maxBH/cv.height);
    L.boardW=cv.width*L.scale;
    L.boardH=cv.height*L.scale;
    L.boardX=(SW-L.boardW)/2;
    L.boardY=L.topH+pad+(maxBH-L.boardH)/2;
    L.btnY=L.boardY+L.boardH+pad;
    L.infoY=L.btnY+L.btnH+pad;
  }
}

// ---------- 渲染: 主菜单 ----------
function renderMenu(){
  clearRegions();
  var ctx=mainCtx;
  ctx.fillStyle=COL.paper;ctx.fillRect(0,0,SW,SH);
  var pad=16;

  // 标题
  setText(ctx,'600 30px '+FF_SERIF,COL.ink,'center','middle');
  ctx.fillText('弈 · 棋道',SW/2,48);
  setText(ctx,'12px '+FF,COL.inkL,'center','middle');
  ctx.fillText('三棋合一 · 人机对弈',SW/2,74);

  // 游戏卡片
  var cardH=54,cardGap=10,cardW=SW-pad*2;
  var games=[
    {id:'gomoku',name:'五子棋',desc:'连五为胜',icon:'●'},
    {id:'go',name:'围  棋',desc:'数子法',icon:'◯'},
    {id:'xiangqi',name:'象  棋',desc:'将死为胜',icon:'帥'}
  ];
  var cy0=100;
  for(var i=0;i<games.length;i++){
    var g=games[i],cy=cy0+i*(cardH+cardGap);
    ctx.fillStyle=COL.paperW;roundRect(ctx,pad,cy,cardW,cardH,10);ctx.fill();
    ctx.strokeStyle=COL.paperD;ctx.lineWidth=1;ctx.stroke();
    setText(ctx,'24px '+FF_SERIF,COL.accent,'center','middle');
    ctx.fillText(g.icon,pad+30,cy+cardH/2);
    setText(ctx,'600 17px '+FF,COL.ink,'left','middle');
    ctx.fillText(g.name,pad+60,cy+cardH/2-8);
    setText(ctx,'11px '+FF,COL.inkL,'left','middle');
    ctx.fillText(g.desc,pad+60,cy+cardH/2+10);
    setText(ctx,'18px '+FF,COL.inkL,'center','middle');
    ctx.fillText('›',pad+cardW-20,cy+cardH/2);
    addRegion(pad,cy,cardW,cardH,function(d){enter(d.id)},{id:g.id});
  }

  // 难度选择
  var dy=cy0+3*(cardH+cardGap)+16;
  setText(ctx,'600 13px '+FF,COL.inkS,'left','middle');
  ctx.fillText('难度',pad,dy+8);
  var diffs=[{v:1,l:'入门'},{v:2,l:'普通'},{v:3,l:'高手'},{v:4,l:'大师'}];
  var dBtnW=(SW-pad*2-9*3)/4,dBtnH=28;
  for(var i=0;i<diffs.length;i++){
    var dx=pad+i*(dBtnW+9);
    drawButton(dx,dy+18,dBtnW,dBtnH,diffs[i].l,{active:curDiff===diffs[i].v,fontSize:12});
    addRegion(dx,dy+18,dBtnW,dBtnH,function(d){curDiff=d.v;requestRender()},{v:diffs[i].v});
  }

  // 先手选择
  var fy=dy+18+dBtnH+16;
  setText(ctx,'600 13px '+FF,COL.inkS,'left','middle');
  ctx.fillText('先手',pad,fy+8);
  var fBtnW=(SW-pad*2-8)/2,fBtnH=28;
  drawButton(pad,fy+18,fBtnW,fBtnH,'你先手',{active:playerFirst,fontSize:12});
  addRegion(pad,fy+18,fBtnW,fBtnH,function(){playerFirst=true;requestRender()});
  drawButton(pad+fBtnW+8,fy+18,fBtnW,fBtnH,'电脑先手',{active:!playerFirst,fontSize:12});
  addRegion(pad+fBtnW+8,fy+18,fBtnW,fBtnH,function(){playerFirst=false;requestRender()});

  // 战绩
  var sy=fy+18+fBtnH+20;
  setText(ctx,'12px '+FF,COL.inkL,'center','middle');
  ctx.fillText('战绩  胜 '+stats.w+'  负 '+stats.l+'  和 '+stats.d,SW/2,sy);

  // 棋谱回放按钮
  var ry=sy+20;
  drawButton(pad,ry,SW-pad*2,36,'棋谱回放',{dark:true,fontSize:14});
  addRegion(pad,ry,SW-pad*2,36,function(){actReplayList()});
}

// ---------- 渲染: 游戏界面 ----------
function renderGame(){
  clearRegions();
  var ctx=mainCtx;
  ctx.fillStyle=COL.paper;ctx.fillRect(0,0,SW,SH);

  // 顶栏
  ctx.fillStyle=COL.ink;ctx.fillRect(0,0,SW,L.topH);
  drawButton(6,6,40,28,'←',{dark:true,fontSize:16,bold:true});
  addRegion(6,6,40,28,function(){exit()});
  setText(ctx,'600 15px '+FF,COL.paper,'center','middle');
  ctx.fillText(titleText,SW/2,L.topH/2);
  setText(ctx,'12px '+FF,thinking?COL.red:statusColor,'right','middle');
  ctx.fillText(statusText+(checkText||''),SW-10,L.topH/2);

  // 棋盘
  if(cv.width>0&&cv.height>0){
    ctx.drawImage(cv,L.boardX,L.boardY,L.boardW,L.boardH);
  }

  // 动作按钮
  if(!over){
    var btns=getGameButtons();
    var btnGap=5;
    var btnW=(SW-16-btnGap*(btns.length-1))/btns.length;
    for(var i=0;i<btns.length;i++){
      var bx=8+i*(btnW+btnGap);
      var dis=thinking;
      if(btns[i].label==='悔棋')dis=dis||isUndoDisabled();
      if(btns[i].label==='虚手')dis=dis||isPassDisabled();
      if(btns[i].label==='认输')dis=dis;
      if(btns[i].label==='存谱')dis=false;
      drawButton(bx,L.btnY,btnW,L.btnH,btns[i].label,{fontSize:12,disabled:dis});
      if(!dis)addRegion(bx,L.btnY,btnW,L.btnH,btns[i].action);
    }
  }

  // 信息区: 胜率条
  var iy=L.infoY;
  if(winRateVisible){
    var barW=SW-32,barH=6,barX=16,barY=iy;
    ctx.fillStyle=COL.paperD;roundRect(ctx,barX,barY,barW,barH,3);ctx.fill();
    var wrW=barW*winRatePct/100;
    ctx.fillStyle=winRatePct>50?COL.green:COL.red;
    roundRect(ctx,barX,barY,wrW,barH,3);ctx.fill();
    setText(ctx,'10px '+FF,COL.inkL,'left','middle');
    ctx.fillText('胜率 '+winRatePct+'%',barX,barY+14);
  }
  if(aiInfoText){
    setText(ctx,'10px '+FF,COL.inkS,'right','middle');
    ctx.fillText(aiInfoText,SW-16,iy+14);
  }
  if(moveListText){
    setText(ctx,'10px '+FF,COL.inkL,'left','top');
    var parts=moveListText.split('  ');
    var showParts=parts.slice(-6);
    ctx.fillText(showParts.join('  '),16,iy+26);
  }

  // 胜负弹窗
  if(over)drawOverModal(ctx);
}

// ---------- 渲染: 棋谱列表 ----------
function renderRpList(){
  clearRegions();
  var ctx=mainCtx;
  ctx.fillStyle=COL.paper;ctx.fillRect(0,0,SW,SH);

  // 顶栏
  ctx.fillStyle=COL.ink;ctx.fillRect(0,0,SW,L.topH);
  drawButton(6,6,40,28,'←',{dark:true,fontSize:16,bold:true});
  addRegion(6,6,40,28,function(){appState=STATE_MENU;requestRender()});
  setText(ctx,'600 15px '+FF,COL.paper,'center','middle');
  ctx.fillText('棋谱回放',SW/2,L.topH/2);

  var list=getReplays();
  if(list.length===0){
    setText(ctx,'14px '+FF,COL.inkL,'center','middle');
    ctx.fillText('暂无棋谱记录',SW/2,SH/2);
    return;
  }

  var pad=12,itemH=56,gap=6;
  var contentH=list.length*(itemH+gap)-gap;
  var visibleH=SH-L.topH-16;
  maxScroll=Math.max(0,contentH-visibleH);
  if(scrollY>maxScroll)scrollY=maxScroll;

  var y=L.topH+8-scrollY;
  for(var i=0;i<list.length;i++){
    var r=list[i];
    if(y+itemH<L.topH){y+=itemH+gap;continue}
    if(y>SH)break;

    var gameName=r.game==='gomoku'?'五子棋':r.game==='go'?'围棋':'象棋';
    var diffName=r.diff===4?'大师':r.diff===3?'高手':r.diff===2?'普通':'入门';
    var resultText=r.result==='win'?'胜':r.result==='lose'?'负':r.result==='draw'?'和':'未完';
    var resultColor=r.result==='win'?COL.green:r.result==='lose'?COL.red:COL.gold;

    ctx.fillStyle=COL.paperW;roundRect(ctx,pad,y,SW-pad*2,itemH,8);ctx.fill();
    ctx.strokeStyle=COL.paperD;ctx.lineWidth=1;ctx.stroke();

    setText(ctx,'600 15px '+FF,COL.ink,'left','middle');
    ctx.fillText(gameName,pad+12,y+18);
    setText(ctx,'11px '+FF,COL.inkL,'left','middle');
    ctx.fillText(r.date+'  '+diffName+'  '+(r.first?'你先':'电脑先'),pad+12,y+38);
    setText(ctx,'600 18px '+FF_SERIF,resultColor,'right','middle');
    ctx.fillText(resultText,SW-pad-50,y+itemH/2);
    setText(ctx,'16px '+FF,COL.inkL,'center','middle');
    ctx.fillText('›',SW-pad-28,y+itemH/2);

    addRegion(pad,y,SW-pad*2-44,itemH,function(d){openRPViewer(d.idx)},{idx:i});
    // 删除按钮
    drawButton(SW-pad-22,y+itemH/2-11,22,22,'×',{fontSize:14,disabled:false});
    addRegion(SW-pad-22,y+itemH/2-11,22,22,function(d){delReplay(d.idx)},{idx:i});

    y+=itemH+gap;
  }

  // 滚动指示
  if(maxScroll>0){
    var sbH=Math.max(20,visibleH*visibleH/contentH);
    var sbY=L.topH+8+(scrollY/maxScroll)*(visibleH-sbH);
    ctx.fillStyle='rgba(120,113,108,0.3)';
    roundRect(ctx,SW-4,sbY,3,sbH,1.5);ctx.fill();
  }
}

// ---------- 渲染: 棋谱回放 ----------
function renderRpView(){
  clearRegions();
  var ctx=mainCtx;
  ctx.fillStyle=COL.paper;ctx.fillRect(0,0,SW,SH);

  // 顶栏
  ctx.fillStyle=COL.ink;ctx.fillRect(0,0,SW,L.topH);
  drawButton(6,6,40,28,'✕',{dark:true,fontSize:14,bold:true});
  addRegion(6,6,40,28,function(){closeRPViewer()});
  var gameName=replayData?(replayData.game==='gomoku'?'五子棋':replayData.game==='go'?'围棋':'象棋'):'';
  setText(ctx,'600 14px '+FF,COL.paper,'center','middle');
  ctx.fillText(gameName+' 回放',SW/2,L.topH/2);

  // 棋盘
  if(cv.width>0&&cv.height>0){
    ctx.drawImage(cv,L.boardX,L.boardY,L.boardW,L.boardH);
  }

  // 步数信息
  var total=replayData?replayData.moves.length:0;
  var iy=L.btnY;
  setText(ctx,'13px '+FF,COL.inkS,'center','middle');
  ctx.fillText('第 '+replayStep+' / '+total+' 手',SW/2,iy+8);

  // 进度条
  var barW=SW-48,barH=4,barX=24,barY=iy+20;
  ctx.fillStyle=COL.paperD;roundRect(ctx,barX,barY,barW,barH,2);ctx.fill();
  if(total>0){
    var pw=barW*replayStep/total;
    ctx.fillStyle=COL.accent;roundRect(ctx,barX,barY,pw,barH,2);ctx.fill();
  }

  // 控制按钮
  var btnGap=6;
  var btnW=(SW-32-btnGap*3)/4;
  var btnY=iy+32;
  drawButton(16,btnY,btnW,34,'⏮',{fontSize:14});
  addRegion(16,btnY,btnW,34,function(){rpRebuildTo(0)});
  drawButton(16+btnW+btnGap,btnY,btnW,34,'◀',{fontSize:16});
  addRegion(16+btnW+btnGap,btnY,btnW,34,function(){rpStep(-1)});
  var autoLabel=rpAutoTimer?'⏸':'▶';
  drawButton(16+(btnW+btnGap)*2,btnY,btnW,34,autoLabel,{fontSize:14,active:!!rpAutoTimer});
  addRegion(16+(btnW+btnGap)*2,btnY,btnW,34,function(){rpAutoPlay()});
  drawButton(16+(btnW+btnGap)*3,btnY,btnW,34,'▶|',{fontSize:14});
  addRegion(16+(btnW+btnGap)*3,btnY,btnW,34,function(){rpRebuildTo(total)});

  // 结果
  if(replayData&&replayData.result){
    var rt=replayData.result==='win'?'胜':replayData.result==='lose'?'负':'和';
    var rc=replayData.result==='win'?COL.green:replayData.result==='lose'?COL.red:COL.gold;
    setText(ctx,'600 14px '+FF_SERIF,rc,'center','middle');
    ctx.fillText(rt,SW/2,btnY+50);
  }
}

// ---------- 主渲染调度 ----------
function render(){
  if(appState===STATE_MENU)renderMenu();
  else if(appState===STATE_GAME)renderGame();
  else if(appState===STATE_RPLIST)renderRpList();
  else if(appState===STATE_RPVIEW)renderRpView();
}

// ---------- 触摸事件 ----------
var scrollY=0,maxScroll=0,touchStartX=0,touchStartY=0,touchMoved=false;

function processTap(mx,my){
  for(var i=hitRegions.length-1;i>=0;i--){
    var r=hitRegions[i];
    if(mx>=r.x&&mx<r.x+r.w&&my>=r.y&&my<r.y+r.h){
      if(r.action)r.action(r.data);
      return;
    }
  }
  if(appState===STATE_GAME&&!over&&!thinking){
    if(typeof L.boardX!=='undefined'&&mx>=L.boardX&&mx<L.boardX+L.boardW&&
       my>=L.boardY&&my<L.boardY+L.boardH){
      handleClick(mx,my);
    }
  }
}

wx.onTouchStart(function(e){
  if(e.touches.length===0)return;
  var t=e.touches[0];
  touchStartX=t.clientX||t.x||0;
  touchStartY=t.clientY||t.y||0;
  touchMoved=false;
});

wx.onTouchMove(function(e){
  if(e.touches.length===0)return;
  var t=e.touches[0];
  var mx=t.clientX||t.x||0,my=t.clientY||t.y||0;
  var dx=mx-touchStartX,dy=my-touchStartY;
  if(Math.abs(dx)>8||Math.abs(dy)>8)touchMoved=true;
  if(appState===STATE_RPLIST&&touchMoved){
    scrollY-=dy;
    scrollY=Math.max(0,Math.min(maxScroll,scrollY));
    touchStartY=my;touchStartX=mx;
    requestRender();
  }
});

wx.onTouchEnd(function(e){
  if(touchMoved){touchMoved=false;return}
  var mx=touchStartX,my=touchStartY;
  if(e.changedTouches&&e.changedTouches.length>0){
    var t=e.changedTouches[0];
    mx=t.clientX||t.x||mx;
    my=t.clientY||t.y||my;
  }
  processTap(mx,my);
});

wx.onTouchCancel(function(){touchMoved=false});

// ---------- 游戏循环 ----------
var _RAF=typeof requestAnimationFrame!=='undefined'?requestAnimationFrame:function(cb){return setTimeout(cb,16)};
function gameLoop(){
  if(needRender){
    needRender=false;
    render();
  }
  _RAF(gameLoop);
}

// ---------- 启动 ----------
needRender=true;
requestAnimationFrame(gameLoop);
