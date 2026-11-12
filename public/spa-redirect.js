// Static-host fallback for deep links (for example /buyer or /admin/orders):
// send the visitor to the app shell, which restores the original path.
(function () {
  var path = window.location.pathname + window.location.search + window.location.hash;
  if (window.location.pathname.indexOf('/api/') === 0) return;
  window.location.replace('/?__path=' + encodeURIComponent(path));
})();
