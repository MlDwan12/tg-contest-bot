# Базовый образ
FROM node:20-alpine

# Рабочая директория
WORKDIR /usr/src/app

# Устанавливаем зависимости
COPY package*.json ./
RUN npm install --omit=dev

# Копируем исходники
COPY . .

# Собираем проект
RUN npm run build

# Экспонируем порт (по умолчанию Nest слушает 3000)
EXPOSE 3000

# Запускаем приложение
CMD ["npm", "run", "start:prod"]
