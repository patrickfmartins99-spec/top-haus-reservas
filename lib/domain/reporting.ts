type ReportReservation = {
  id: string;
  customerName: string;
  whatsapp: string;
  partySize: number;
  serviceDate: string;
  status: string;
  cancelledAt?: string | null;
  cancellationActorType?: string;
  cancellationReasonLabel?: string;
  cancellationNote?: string;
  noShowAt?: string | null;
  outcomeReasonLabel?: string;
  outcomeNote?: string;
};

type ReportWaitlistEntry = {
  partySize: number;
  status: string;
  enteredAt?: string | null;
  seatedAt?: string | null;
};

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

function dateSequence(endDate: string, days: number) {
  const end = new Date(`${endDate}T12:00:00-03:00`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (days - index - 1));
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }).format(date);
  });
}

function isWithinPeriod(
  value: string | null | undefined,
  start: number,
  end: number,
) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= start && time <= end;
}

export function buildOperationalReport(
  reservations: ReportReservation[],
  waitlist: ReportWaitlistEntry[],
  days: number,
  endDate: string,
) {
  const dates = dateSequence(endDate, days);
  const startDate = dates[0];
  const startTime = new Date(`${startDate}T00:00:00-03:00`).getTime();
  const endTime = new Date(`${endDate}T23:59:59.999-03:00`).getTime();
  const operational = reservations.filter(
    (item) => item.serviceDate >= startDate && item.serviceDate <= endDate,
  );
  const valid = operational.filter(
    (item) => !['cancelled', 'no_show'].includes(item.status),
  );
  const operatingDates = dates.filter((date) => {
    const weekday = new Date(`${date}T12:00:00-03:00`).getDay();
    return (
      weekday !== 1 || operational.some((item) => item.serviceDate === date)
    );
  });

  const byDate = new Map<string, { reservations: number; people: number }>();
  for (const reservation of valid) {
    const current = byDate.get(reservation.serviceDate) ?? {
      reservations: 0,
      people: 0,
    };
    current.reservations += 1;
    current.people += reservation.partySize;
    byDate.set(reservation.serviceDate, current);
  }

  const daily = dates.slice(-31).map((date) => ({
    date,
    label: dateFormatter.format(new Date(`${date}T12:00:00-03:00`)),
    reservations: byDate.get(date)?.reservations ?? 0,
    people: byDate.get(date)?.people ?? 0,
  }));
  const busiestDays = [...byDate.entries()]
    .map(([date, value]) => ({
      date,
      label: dateFormatter.format(new Date(`${date}T12:00:00-03:00`)),
      ...value,
    }))
    .sort(
      (first, second) =>
        second.people - first.people ||
        second.reservations - first.reservations,
    )
    .slice(0, 7);

  const cancellationMap = new Map<
    string,
    ReturnType<typeof cancellationItem>
  >();
  function cancellationItem(item: ReportReservation) {
    const noShow = item.status === 'no_show';
    return {
      id: item.id,
      customerName: item.customerName,
      serviceDate: item.serviceDate,
      occurredAt: noShow ? (item.noShowAt ?? null) : (item.cancelledAt ?? null),
      type: noShow ? 'No show' : 'Cancelamento',
      actor: noShow
        ? 'Equipe'
        : item.cancellationActorType === 'customer'
          ? 'Cliente'
          : 'Equipe',
      reason: noShow
        ? item.outcomeReasonLabel || 'Motivo não registrado (registro anterior)'
        : item.cancellationReasonLabel ||
          'Motivo não registrado (registro anterior)',
      note: noShow ? (item.outcomeNote ?? '') : (item.cancellationNote ?? ''),
    };
  }
  for (const item of reservations) {
    const occurredAt =
      item.status === 'no_show' ? item.noShowAt : item.cancelledAt;
    if (
      ['cancelled', 'no_show'].includes(item.status) &&
      isWithinPeriod(occurredAt, startTime, endTime)
    ) {
      cancellationMap.set(item.id, cancellationItem(item));
    }
  }
  const cancellations = [...cancellationMap.values()].sort((first, second) =>
    String(second.occurredAt).localeCompare(String(first.occurredAt)),
  );

  const customers = new Map<
    string,
    {
      customerName: string;
      visits: number;
      people: number;
      lastVisit: string;
    }
  >();
  for (const item of operational.filter((reservation) =>
    ['seated', 'completed'].includes(reservation.status),
  )) {
    const key =
      item.whatsapp.replace(/\D/g, '') ||
      item.customerName.trim().toLocaleLowerCase('pt-BR');
    const current = customers.get(key) ?? {
      customerName: item.customerName,
      visits: 0,
      people: 0,
      lastVisit: item.serviceDate,
    };
    current.visits += 1;
    current.people += item.partySize;
    if (item.serviceDate >= current.lastVisit) {
      current.lastVisit = item.serviceDate;
      current.customerName = item.customerName;
    }
    customers.set(key, current);
  }
  const frequentCustomers = [...customers.values()]
    .sort(
      (first, second) =>
        second.visits - first.visits || second.people - first.people,
    )
    .slice(0, 10);

  const waitlistInPeriod = waitlist.filter((entry) =>
    isWithinPeriod(entry.enteredAt, startTime, endTime),
  );
  const seatedWaits = waitlistInPeriod
    .filter(
      (entry) => entry.status === 'seated' && entry.enteredAt && entry.seatedAt,
    )
    .map(
      (entry) =>
        new Date(entry.seatedAt!).getTime() -
        new Date(entry.enteredAt!).getTime(),
    )
    .filter((duration) => duration >= 0);
  const averageWaitMinutes = seatedWaits.length
    ? Math.round(
        seatedWaits.reduce((sum, duration) => sum + duration, 0) /
          seatedWaits.length /
          60_000,
      )
    : 0;
  const waitlistOutcomes = [
    {
      label: 'Atendidos',
      value: waitlistInPeriod.filter((item) => item.status === 'seated').length,
    },
    {
      label: 'Saíram da fila',
      value: waitlistInPeriod.filter((item) => item.status === 'removed')
        .length,
    },
    {
      label: 'No show',
      value: waitlistInPeriod.filter((item) => item.status === 'no_show')
        .length,
    },
  ];

  const arrived = operational.filter((item) =>
    ['seated', 'completed'].includes(item.status),
  ).length;
  const noShows = operational.filter(
    (item) => item.status === 'no_show',
  ).length;

  return {
    period: { days, startDate, endDate },
    summary: {
      reservations: valid.length,
      people: valid.reduce((sum, item) => sum + item.partySize, 0),
      averageReservationsPerDay: Number(
        (valid.length / Math.max(operatingDates.length, 1)).toFixed(1),
      ),
      cancellations: cancellations.length,
      noShowRate:
        arrived + noShows
          ? Number(((noShows / (arrived + noShows)) * 100).toFixed(1))
          : 0,
      averageWaitMinutes,
    },
    daily,
    busiestDays,
    cancellations,
    frequentCustomers,
    waitlistOutcomes,
  };
}
