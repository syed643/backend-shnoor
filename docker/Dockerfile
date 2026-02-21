FROM node:20-bullseye

# System deps (keep if you really need Java / Python)
RUN apt-get update && \
    apt-get install -y \
      python3 \
      python3-pip \
      gcc \
      g++ \
      openjdk-17-jdk && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="$JAVA_HOME/bin:$PATH"

WORKDIR /app

# Install deps first (better caching)
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Render provides PORT automatically
EXPOSE 5000

# 🚀 START YOUR SERVER (THIS IS REQUIRED)
CMD ["node", "app.js"]
