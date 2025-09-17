import { prisma } from './utils/prisma.js';

async function main() {
	const userId = 'demo-user';
	// Upsert demo user
	await prisma.user.upsert({
		where: { id: userId },
		update: {},
		create: {
			id: userId,
			email: 'demo@example.com',
			passwordHash: 'x',
		},
	});

	// Create campaign
	const campaign = await prisma.campaign.create({
		data: {
			name: 'Demo Outreach',
			ownerId: userId,
			status: 'ACTIVE',
			audienceJson: { source: 'manual' },
		},
	});

	// Templates
	const messageTemplate = await prisma.template.create({
		data: {
			campaignId: campaign.id,
			name: 'Intro DM',
			type: 'OUTREACH',
			content: 'Hi {{firstName}}, great to connect! Quick thought for {{company}}.',
			enabled: true,
			order: 1,
		},
	});

	// Sequence with steps
	const sequence = await prisma.sequence.create({
		data: {
			campaignId: campaign.id,
			name: '2-step demo',
			steps: {
				create: [
					{ stepOrder: 1, action: 'SEND_CONNECTION', delayHours: 0 },
					{ stepOrder: 2, action: 'SEND_MESSAGE', delayHours: 1, templateId: messageTemplate.id },
				],
			},
		},
		include: { steps: true },
	});

	// Lead
	const lead = await prisma.lead.create({
		data: {
			firstName: 'Alex',
			lastName: 'Example',
			company: 'ExampleCo',
			title: 'VP Growth',
			profileUrl: 'https://www.linkedin.com/in/example',
		},
	});

	// Assign lead into the sequence and schedule now
	await prisma.leadAssignment.create({
		data: {
			leadId: lead.id,
			campaignId: campaign.id,
			sequenceId: sequence.id,
			status: 'PENDING',
			nextRunAt: new Date(),
		},
	});

	console.log('Seed complete:', { campaignId: campaign.id, sequenceId: sequence.id, leadId: lead.id });
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});


