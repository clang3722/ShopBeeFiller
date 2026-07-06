// guide.js - 折叠面板控制
(function() {
  const toggle = document.getElementById('guideToggle');
  const body = document.getElementById('guideBody');
  const arrow = document.getElementById('guideArrow');
  
  if (toggle && body && arrow) {
    toggle.addEventListener('click', function() {
      body.classList.toggle('open');
      arrow.classList.toggle('open');
    });
  }
})();