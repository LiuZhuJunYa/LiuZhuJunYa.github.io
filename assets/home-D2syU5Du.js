import{r as V,_ as M}from"./YunFooter.vue_vue_type_style_index_0_lang-DfpCur5G.js";import{d as v,o as n,e as o,h as c,r as S,j as y,L as H,t as g,g as i,_ as z,ar as D,V as C,s as m,x as b,F as B,m as F,f as _,c as $,q as w,n as Y,as as R,a as T,at as A,v as E,a9 as I}from"./app-BIBXaLat.js";const G={class:"yun-notice m-auto"},P=["innerHTML"],j=v({__name:"YunNotice",props:{content:{}},setup(d){return(t,a)=>(n(),o("div",G,[c("span",{innerHTML:t.content},null,8,P),S(t.$slots,"default")]))}}),q={class:"say"},O={key:0,class:"say-content animate-fade-in animate-iteration-1"},W={key:1,class:"say-author"},J={key:2,class:"say-from"},K=v({__name:"YunSay",setup(d){const t=[{content:"路旁青衣树上斜，明眸杉影叹妃曦。落尽红樱君不见，轻绘梨花泪沾衣。待到海棠花如雪，来世仍为君倾心。",author:"上杉·绘梨衣",from:"《龙族3・黑月之潮》"},{content:"“04.24，和Sakura去东京天空树，世界上最暖和的地方在天空树的顶上。” “04.25，和Sakura去明治神宫，有人在那里举办婚礼。” “04.26，和Sakura去迪士尼，鬼屋很可怕，但是有Sakura在，所以不可怕。” “Sakura最好了。”",author:"上杉·绘梨衣",from:"《龙族3・黑月之潮》"},{content:"我们都是小怪兽，终有一天会被正义的奥特曼杀死。",author:"上杉·绘梨衣",from:"《龙族3・黑月之潮》"}],a=y(""),l=y(""),s=y("");function u(){const r=Math.floor(Math.random()*t.length),e=t[r];a.value=e.content,l.value=e.author,s.value=e.from}return H(()=>{u()}),(r,e)=>(n(),o("div",q,[a.value?(n(),o("span",O,g(a.value),1)):i("v-if",!0),l.value?(n(),o("span",W,g(l.value),1)):i("v-if",!0),s.value?(n(),o("span",J,g(s.value),1)):i("v-if",!0)]))}}),Q=c("div",{"i-ri-arrow-down-s-line":"","inline-flex":""},null,-1),U=[Q],X=v({__name:"YunGoDown",setup(d){function t(){const a=document.getElementById("yun-banner");a&&window.scrollTo({top:a.clientHeight,behavior:"smooth"})}return(a,l)=>(n(),o("button",{class:"go-down","aria-label":"go-down",onClick:t},U))}}),Z={},ee={class:"yun-cloud"},ne=D('<svg class="waves" viewBox="0 24 150 28" preserveAspectRatio="none" shape-rendering="auto"><defs><path id="gentle-wave" d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z" fill="var(--yun-c-cloud)"></path></defs><g class="parallax"><use xlink:href="#gentle-wave" x="48" y="0"></use><use xlink:href="#gentle-wave" x="48" y="3"></use><use xlink:href="#gentle-wave" x="48" y="5"></use><use xlink:href="#gentle-wave" x="48" y="7"></use></g></svg>',1),te=[ne];function ae(d,t){return n(),o("div",ee,te)}const oe=z(Z,[["render",ae]]),se={class:"banner-line-container"},re={class:"banner-char-container"},ce={class:"char"},le={class:"banner-line-container bottom"},ie=v({__name:"YunBanner",setup(d){const t=C(),a=m(()=>{const r=[];for(let e=0;e<t.value.banner.title.length;e++){const p=V(1.5,3.5);r.push(p)}return r}),l=m(()=>a.value.reduce((r,e)=>r+e,0)/2),s=m(()=>({"--banner-line-height":`calc(var(--banner-height, 100vh) / 2 - ${l.value}rem)`})),u=y(!0);return(r,e)=>{var f;const p=oe,k=X;return n(),o("div",{id:"yun-banner",style:Y(s.value)},[c("div",se,[c("div",{class:b(["banner-line vertical-line-top",{active:u.value}])},null,2)]),c("div",re,[(n(!0),o(B,null,F(_(t).banner.title,(x,h)=>(n(),o("div",{key:h,class:"char-box"},[c("span",{class:b([h%2!==0?"char-right":"char-left"]),style:Y({"--banner-char-size":`${a.value[h]}rem`})},[c("span",ce,g(x),1)],6)]))),128))]),c("div",le,[c("div",{class:b(["banner-line vertical-line-bottom",{active:u.value}])},null,2)]),(f=_(t).banner.cloud)!=null&&f.enable?(n(),$(p,{key:0})):i("v-if",!0),w(k)],4)}}}),de=v({__name:"home",setup(d){const t=R(),a=T(),l=A("home"),s=C(),u=m(()=>a.path.startsWith("/page")),r=m(()=>{const e=s.value.notice;return e.enable&&(u.value?!e.hideInPages:!0)});return(e,p)=>{const k=I,f=ie,x=K,h=j,L=E("RouterView"),N=M;return n(),o("main",{class:b(["yun-main flex-center",_(l)&&!_(t).leftSidebar.isOpen?"pl-0":"md:pl-$va-sidebar-width"]),flex:"~ col",w:"full"},[w(k,{"show-hamburger":!0}),u.value?i("v-if",!0):(n(),o(B,{key:0},[_(s).banner.enable?(n(),$(f,{key:0})):i("v-if",!0),_(s).say.enable?(n(),$(x,{key:1,w:"full"})):i("v-if",!0)],64)),r.value?(n(),$(h,{key:1,content:_(s).notice.content,mt:"4"},null,8,["content"])):i("v-if",!0),S(e.$slots,"board"),S(e.$slots,"default",{},()=>[w(L)]),w(N)],2)}}});export{de as default};