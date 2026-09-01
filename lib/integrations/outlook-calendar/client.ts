const GRAPH_ME_BASE = "https://graph.microsoft.com/v1.0/me";

// v1 simplification: every date/time this module sends or reads is UTC.
// Real per-business timezone configuration is a real follow-up, not
// something guessed at here — see CLAUDE.md #30 on not over-building
// ahead of an actual need.
const TIME_ZONE = "UTC";

async function graphFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(`${GRAPH_ME_BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Microsoft Graph request to ${path} failed (${response.status}): ${body}`,
    );
  }
  return response;
}

function attendeeList(emails: string[]) {
  return emails.map((address) => ({
    emailAddress: { address },
    type: "required",
  }));
}

export interface MeetingTimeSuggestion {
  start: string;
  end: string;
  confidence: number;
}

interface FindMeetingTimesResponse {
  meetingTimeSuggestions: {
    confidence: number;
    meetingTimeSlot: {
      start: { dateTime: string };
      end: { dateTime: string };
    };
  }[];
}

export async function findMeetingTimes(
  accessToken: string,
  params: {
    attendees: string[];
    durationMinutes: number;
    rangeStart: string;
    rangeEnd: string;
  },
): Promise<MeetingTimeSuggestion[]> {
  const response = await graphFetch(accessToken, "/findMeetingTimes", {
    method: "POST",
    body: JSON.stringify({
      attendees: attendeeList(params.attendees),
      timeConstraint: {
        timeslots: [
          {
            start: { dateTime: params.rangeStart, timeZone: TIME_ZONE },
            end: { dateTime: params.rangeEnd, timeZone: TIME_ZONE },
          },
        ],
      },
      meetingDuration: `PT${params.durationMinutes}M`,
    }),
  });
  const data = (await response.json()) as FindMeetingTimesResponse;
  return data.meetingTimeSuggestions.map((s) => ({
    start: s.meetingTimeSlot.start.dateTime,
    end: s.meetingTimeSlot.end.dateTime,
    confidence: s.confidence,
  }));
}

export async function createCalendarEvent(
  accessToken: string,
  params: {
    subject: string;
    start: string;
    end: string;
    attendees: string[];
  },
): Promise<{ id: string }> {
  const response = await graphFetch(accessToken, "/events", {
    method: "POST",
    body: JSON.stringify({
      subject: params.subject,
      start: { dateTime: params.start, timeZone: TIME_ZONE },
      end: { dateTime: params.end, timeZone: TIME_ZONE },
      attendees: attendeeList(params.attendees),
    }),
  });
  const data = (await response.json()) as { id: string };
  return { id: data.id };
}
