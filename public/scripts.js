document.querySelector('.home .btn').addEventListener('click', function(event) {
    event.preventDefault();
    document.querySelector('.home').hidden = true;
    document.querySelector('.login').hidden = false;
});

document.querySelector('#loginForm').addEventListener('submit', function(event) {
    event.preventDefault();
    alert('Login functionality is under development!');
});
