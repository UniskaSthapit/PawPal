/* PawPal enhancements: HTTPS redirect (never on localhost), cookie consent, footer legal links. No business logic here. */
(function(){
  var h=location.hostname,local=/^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|\[::1\])/.test(h)||h.endsWith('.local');
  if(location.protocol==='http:'&&!local){location.replace('https:'+location.href.substring(location.protocol.length));return;}
  var KEY='pp_cookie_consent';
  function stored(){try{return localStorage.getItem(KEY);}catch(e){return null;}}
  function ready(fn){document.readyState!=='loading'?fn():document.addEventListener('DOMContentLoaded',fn);}
  ready(function(){
    var f=document.querySelector('footer');
    if(f&&!f.querySelector('a[href*="privacy"]')){
      var d=document.createElement('nav');d.className='pp-legal';d.setAttribute('aria-label','Legal');
      d.innerHTML='<a href="privacy.html">Privacy Policy</a><a href="terms.html">Terms &amp; Conditions</a>';f.appendChild(d);
    }
    if(stored())return;
    var b=document.createElement('div');b.className='pp-cookie';b.setAttribute('role','region');b.setAttribute('aria-label','Cookie consent');
    b.innerHTML='<p>PawPal uses essential cookies to keep you signed in. See our <a href="privacy.html">Privacy Policy</a>.</p><button type="button">Accept</button>';
    b.querySelector('button').addEventListener('click',function(){try{localStorage.setItem(KEY,'accepted');}catch(e){}b.remove();});
    document.body.appendChild(b);
  });
})();
