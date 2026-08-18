import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';
import { Role } from '@prisma/client';

async function main() {
  const adminEmail = 'admin@ofc.de';
  const adminPassword = 'OFCkickt1901!';
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const pw = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'OFC Admin',
        passwordHash: pw,
        role: 'ADMIN',
      },
    });
    console.log(`Admin angelegt: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log(`Admin existiert bereits: ${adminEmail}`);
  }

  // Beispielhafte Standard-Fragen für Tägliche Abfrage
  const exampleQuestions = [
    { text: 'Wie hast du geschlafen?', sortOrder: 1 },
    { text: 'Wie fühlst du dich heute körperlich?', sortOrder: 2 },
    { text: 'Wie fühlst du dich mental?', sortOrder: 3 },
    { text: 'Wie ist deine Motivation heute?', sortOrder: 4 },
  ];
  for (const q of exampleQuestions) {
    const ex = await prisma.dailyQuestion.findFirst({
      where: { text: q.text },
    });
    if (!ex) {
      await prisma.dailyQuestion.create({
        data: {
          text: q.text,
          questionType: 'RATING_1_10',
          sortOrder: q.sortOrder,
          active: true,
          repeatTime: '06:00',
        },
      });
      console.log(`Tägliche Frage angelegt: ${q.text}`);
    }
  }

  // Beispielhafte Alert-Konfiguration
  const exCfg = await prisma.alertConfig.findFirst();
  if (!exCfg) {
    await prisma.alertConfig.create({
      data: {
        name: 'Schlechte Tagesform',
        scope: 'ALL',
        threshold: 3,
        consecutiveCount: 2,
        active: true,
      },
    });
    console.log('Warnsignal-Konfiguration angelegt.');
  }

  console.log('Seed abgeschlossen.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
