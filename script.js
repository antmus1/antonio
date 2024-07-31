document.addEventListener('DOMContentLoaded', () => {
    loadReminders();
});

function addReminder() {
    const date = document.getElementById('date').value;
    const time = document.getElementById('time').value;
    const location = document.getElementById('location').value;
    const text = document.getElementById('text').value;

    if (date && text) {
        const reminder = { date, time, location, text };
        saveReminder(reminder);
        displayReminders();
    } else {
        alert('Per favore, inserisci una data e un testo per il promemoria.');
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

    reminders
        .filter(reminder => {
            const reminderDate = new Date(reminder.date);
            return reminderDate >= today;
        })
        .forEach(reminder => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <strong>Data:</strong> ${reminder.date} <br>
                <strong>Orario:</strong> ${reminder.time ? reminder.time : 'N/A'} <br>
                <strong>Luogo:</strong> ${reminder.location ? reminder.location : 'N/A'} <br>
                <strong>Testo:</strong> ${reminder.text}
            `;
            listItem.classList.add('reminder-item');
            reminderItems.appendChild(listItem);
        });
}
