export function getMonthMatrix(year, month) {
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const matrix = [];
    let row = Array(7).fill(null);
    let currentDay = 1;

    for (let i = startDay; i < 7; i++) {
        row[i] = currentDay++;
    }
    matrix.push(row);

    while (currentDay <= daysInMonth) {
        row = Array(7).fill(null);
        for (let i = 0; i < 7 && currentDay <= daysInMonth; i++) {
            row[i] = currentDay++;
        }
        matrix.push(row);
    }

    return matrix;
}

export function getWeekRange(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - (day === 0 ? 6 : day - 1);
    const monday = new Date(d.setDate(diff));

    const week = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        week.push(day);
    }
    return week;
}