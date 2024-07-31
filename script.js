document.addEventListener('DOMContentLoaded', () => {
    loadReminders();
});

function addReminder() {
    const date = document.getElementById('date').value;
    const time = document.getElementById('time').value;
    const location = document.getElementById('location').value;

    if (date) {
        const reminder = { date, time, location };
        saveReminder(reminder);
        displayReminders();
    } else {
        alert('Per favore, inserisci una data.');
    }
}

function saveReminder(reminder) {
    let reminders = JSON.parse(localStorage.getItem('reminders')) || [];
    reminders.push(reminder);
    localStorage.setItem('reminders', JSON.stringify(reminders));
}

function loadReminders() {
    displayReminders();
}

function displayReminders() {
    const reminders = JSON.parse(localStorage.getItem('reminders')) || [];
    const reminderItems = document.getElementById('reminder-items');
    reminderItems.innerHTML = '';

    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    reminders
        .filter(reminder => {
            const reminderDate = new Date(reminder.date);
            return reminderDate >= today && reminderDate <= nextWeek;
        })
        .forEach(reminder => {
            const listItem = document.createElement('li');
            listItem.textContent = `${reminder.date} ${reminder.time ? reminder.time : ''} - ${reminder.location}`;
            reminderItems.appendChild(listItem);
        });
}
