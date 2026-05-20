const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pino = require('pino');

const PREFIX = '!';
const AUDIO_DIR = path.join(__dirname, 'audios');
const AUTH_DIR = path.join(__dirname, 'auth');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR);

process.on('uncaughtException', (err) => console.error('Error crítico:', err.message));
process.on('unhandledRejection', (err) => console.error('Promesa rechazada:', err.message));

const logger = pino({ level: 'silent' });

function getText(msg) {
  const key = Object.keys(msg.message)[0];
  if (key === 'conversation') return msg.message.conversation;
  if (key === 'extendedTextMessage') return msg.message.extendedTextMessage.text;
  if (key === 'imageMessage') return msg.message.imageMessage.caption;
  if (key === 'videoMessage') return msg.message.videoMessage.caption;
  return '';
}

function isGroup(jid) {
  return jid.endsWith('@g.us');
}

async function startBot() {
  console.log('Iniciando bot de WhatsApp...');

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger,
    browser: ['Bot Amigos', 'Chrome', '120'],
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n╔══════════════════════════════════════╗');
      console.log('║    ESCANEA EL QR CON TU WHATSAPP     ║');
      console.log('╚══════════════════════════════════════╝\n');
    }
    if (connection === 'open') {
      console.log('\n╔══════════════════════════════════════╗');
      console.log('║   ✅ BOT CONECTADO EXITOSAMENTE!     ║');
      console.log('╚══════════════════════════════════════╝\n');
      console.log('Escribe !menu en el grupo para probar');
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`Desconectado (código: ${code})`);
      if (shouldReconnect) {
        console.log('Reconectando en 5 segundos...');
        setTimeout(startBot, 5000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const textContent = getText(msg);
    if (!textContent.startsWith(PREFIX)) return;

    const chatId = msg.key.remoteJid;
    const args = textContent.slice(1).split(' ');
    const command = args.shift().toLowerCase();

    try {
      switch (command) {
        case 'help':
        case 'menu':
        case 'comandos':
          await sendHelp(sock, chatId, msg);
          break;
        case 'play':
        case 'musica':
        case 'music':
          await sendPlay(sock, chatId, msg, args);
          break;
        case 'saludo':
        case 'hola':
          await sendSaludo(sock, chatId);
          break;
        case 'dado':
        case 'roll':
          await sendDado(sock, chatId);
          break;
        case 'moneda':
        case 'coin':
          await sendMoneda(sock, chatId);
          break;
        case 'frase':
          await sendFrase(sock, chatId);
          break;
        case 'meme':
          await sendMeme(sock, chatId);
          break;
        case 'clima':
        case 'weather':
          await sendClima(sock, chatId, args);
          break;
        case 'noticia':
          await sendNoticia(sock, chatId);
          break;
        case 'ping':
          await sock.sendMessage(chatId, { text: '🏓 Pong!' }, { quoted: msg });
          break;
        case 'echo':
          await sock.sendMessage(chatId, { text: args.join(' ') || 'Dime algo para repetir' }, { quoted: msg });
          break;
        case '8ball':
          await send8ball(sock, chatId, msg, args);
          break;
        default:
          await sock.sendMessage(chatId, { text: `❌ Comando "${command}" no encontrado. Usa *!menu*` }, { quoted: msg });
      }
    } catch (err) {
      console.error('Error en comando:', err);
      await sock.sendMessage(chatId, { text: '❌ Ocurrió un error' }, { quoted: msg });
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    if (update.action === 'add') {
      try {
        for (const participantId of update.participants) {
          const number = participantId.split('@')[0];
          const welcome = `🎉 ¡Bienvenido/a al grupo, @${number}! 🎉\n\nPor favor, preséntate con los siguientes datos:\n📸 *Foto* (envía una selfie)\n👤 *Nombre*\n🎂 *Edad*\n📍 *¿Dónde vives?*\n\n¡Esperamos conocerte mejor! 🥳`;

          await sock.sendMessage(update.id, {
            text: welcome,
            mentions: [participantId],
          });
        }
      } catch (err) {
        console.error('Error en bienvenida:', err.message);
      }
    }
  });
}

async function sendHelp(sock, chatId, msg) {
  const text = `🤖 *BOT AMIGOS - Comandos*

🎵 *!play <nombre>* - Busca y reproduce música
🎲 *!dado* - Lanza un dado (1-6)
🪙 *!moneda* - Cara o cruz
💬 *!frase* - Frase motivacional
😂 *!meme* - Meme aleatorio
🌤 *!clima <ciudad>* - Clima actual
📰 *!noticia* - Última noticia
🔮 *!8ball <pregunta>* - Bola mágica 8
👋 *!saludo* - Saludo aleatorio
🏓 *!ping* - Ping Pong
📢 *!echo <texto>* - Repite un mensaje
❓ *!menu* - Muestra este menú

Creado con ❤️ para el grupo`;
  await sock.sendMessage(chatId, { text }, { quoted: msg });
}

async function sendPlay(sock, chatId, msg, args) {
  if (!args.length) {
    return sock.sendMessage(chatId, { text: '🎵 Usa: *!play <nombre de la canción>*\nEjemplo: !play Queen Bohemian Rhapsody' }, { quoted: msg });
  }

  const query = args.join(' ');
  await sock.sendMessage(chatId, { text: `🔍 Buscando "${query}"...` }, { quoted: msg });

  try {
    const searchResult = await yts(query);
    const videos = searchResult.videos.slice(0, 5);

    if (!videos.length) {
      return sock.sendMessage(chatId, { text: '❌ No encontré resultados.' }, { quoted: msg });
    }

    const video = videos[0];
    const info = {
      title: video.title,
      url: video.url,
      duration: formatDuration(video.duration.seconds),
      author: video.author.name,
    };

    const trackMsg = await sock.sendMessage(chatId, {
      text: `🎵 *${info.title}*\n👤 ${info.author}\n⏱ ${info.duration}\n⬇️ Descargando audio...`,
    }, { quoted: msg });

    const audioPath = path.join(AUDIO_DIR, `${video.videoId}.mp3`);

    if (!fs.existsSync(audioPath)) {
      const stream = ytdl(video.url, {
        quality: 'lowestaudio',
        filter: 'audioonly',
      });
      await new Promise((resolve, reject) => {
        stream
          .pipe(fs.createWriteStream(audioPath))
          .on('finish', resolve)
          .on('error', reject);
      });
    }

    await sock.sendMessage(chatId, {
      audio: fs.readFileSync(audioPath),
      mimetype: 'audio/mp4',
      fileName: `${video.videoId}.mp3`,
    }, { quoted: msg });

  } catch (err) {
    console.error('Play error:', err);
    await sock.sendMessage(chatId, { text: '❌ Error al descargar la música. Intenta con otra canción.' }, { quoted: msg });
  }
}

async function sendSaludo(sock, chatId) {
  const saludos = [
    '¡Hola! ¿Cómo están? 👋',
    '¡Buenas! 🎉',
    '¿Qué onda? 🔥',
    '¡Saludos grupo! ✌️',
    'Hey! ¿Cómo va todo? 😎',
    'Arriba esa energía! 🚀',
    'Holaaaa 🖐️',
  ];
  const random = saludos[Math.floor(Math.random() * saludos.length)];
  await sock.sendMessage(chatId, { text: random });
}

async function sendDado(sock, chatId) {
  const result = Math.floor(Math.random() * 6) + 1;
  await sock.sendMessage(chatId, { text: `🎲 *Dado*: Sacaste un *${result}*` });
}

async function sendMoneda(sock, chatId) {
  const result = Math.random() < 0.5 ? 'Cara' : 'Cruz';
  await sock.sendMessage(chatId, { text: `🪙 *Moneda*: Salió *${result}*` });
}

async function sendFrase(sock, chatId) {
  const frases = [
    '💪 "El éxito es la suma de pequeños esfuerzos repetidos día tras día."',
    '🌟 "No cuentes los días, haz que los días cuenten."',
    '🔥 "La única manera de hacer un gran trabajo es amar lo que haces."',
    '🚀 "El momento es ahora."',
    '💡 "Cree en ti mismo y todo será posible."',
    '🌈 "Después de la tormenta siempre llega la calma."',
    '🎯 "El esfuerzo de hoy es el éxito de mañana."',
    '⭐ "Sé el cambio que quieres ver en el mundo."',
  ];
  const random = frases[Math.floor(Math.random() * frases.length)];
  await sock.sendMessage(chatId, { text: random });
}

async function sendMeme(sock, chatId) {
  try {
    const res = await axios.get('https://meme-api.com/gimme');
    const memeUrl = res.data.url || res.data.preview?.[res.data.preview.length - 1];

    if (res.data.nsfw) {
      return sock.sendMessage(chatId, { text: '❌ No puedo enviar memes NSFW en el grupo.' });
    }

    const imgRes = await axios.get(memeUrl, { responseType: 'arraybuffer' });
    const titulo = res.data.title || 'Meme';

    await sock.sendMessage(chatId, {
      image: imgRes.data,
      caption: `😂 *${titulo}*`,
    });
  } catch {
    await sock.sendMessage(chatId, { text: '😂 *Meme del día:*\n¿Por qué el programador siempre tiene frío? Porque abre muchas ventanas. 🪟' });
  }
}

async function sendClima(sock, chatId, args) {
  if (!args.length) {
    return sock.sendMessage(chatId, { text: '🌤 Usa: *!clima <ciudad>*\nEjemplo: !clima Buenos Aires' });
  }

  const city = args.join(' ');
  try {
    const res = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%h+%w&lang=es`);
    await sock.sendMessage(chatId, { text: `🌤 *Clima en ${city}:*\n${res.data.trim()}` });
  } catch {
    await sock.sendMessage(chatId, { text: `❌ No pude obtener el clima de "${city}".` });
  }
}

async function sendNoticia(sock, chatId) {
  try {
    const res = await axios.get('https://newsapi.org/v2/top-headlines', {
      params: { country: 'ar', apiKey: process.env.NEWS_API_KEY || 'demo' },
    });
    const articles = res.data.articles;
    if (articles?.length > 0) {
      const article = articles.find(a => a.title && a.title !== '[Removed]') || articles[0];
      await sock.sendMessage(chatId, { text: `📰 *${article.title}*\n${article.description || ''}\n🔗 ${article.url}` });
    } else {
      await sock.sendMessage(chatId, { text: '📰 No pude obtener noticias ahora.' });
    }
  } catch {
    await sock.sendMessage(chatId, { text: '📰 No pude obtener noticias ahora.' });
  }
}

async function send8ball(sock, chatId, msg, args) {
  if (!args.length) {
    return sock.sendMessage(chatId, { text: '🔮 Usa: *!8ball <pregunta>*\nEjemplo: !8ball voy a ganar la lotería?' }, { quoted: msg });
  }

  const respuestas = [
    '🔮 Sí, definitivamente.',
    '🔮 Es probable.',
    '🔮 Sin duda alguna.',
    '🔮 No cuentes con ello.',
    '🔮 Pregunta de nuevo más tarde.',
    '🔮 Mejor no te digo ahora.',
    '🔮 Mis fuentes dicen que no.',
    '🔮 Las señales apuntan a que sí.',
    '🔮 No puedo predecirlo ahora.',
    '🔮 Concéntrate y pregunta de nuevo.',
  ];
  const answer = respuestas[Math.floor(Math.random() * respuestas.length)];
  await sock.sendMessage(chatId, { text: `🔮 *Bola 8:* "${args.join(' ')}"\n${answer}` }, { quoted: msg });
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

startBot();
