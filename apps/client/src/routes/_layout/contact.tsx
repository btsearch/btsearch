import { Alert02Icon, GithubIcon, Mail01Icon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ContactLink {
  icon: typeof Mail01Icon;
  label: string;
  href: string;
}

interface TeamMember {
  name: string;
  role: string;
  description?: string;
  avatarUrl?: string;
  initials: string;
  links: ContactLink[];
}

const teamMembers: TeamMember[] = [
  {
    name: "Krzysztof Niemczyk",
    role: "Administrator bazy danych i serwisu",
    description: "Kwestie merytoryczne związane z danymi w bazie, zapytania odnośnie potencjalnej współpracy.",
    initials: "K",
    links: [{ icon: Mail01Icon, label: "k.niemczyk@btsearch.pl", href: "mailto:k.niemczyk@btsearch.pl" }],
  },
  {
    name: "ririxi",
    role: "Opiekun techniczny projektu",
    description:
      "Rozwój i utrzymanie serwisu oraz kwestie techniczne. Logi lub zdjęcia potwierdzające zgłoszenie, pytania związane z danymi w bazie.",
    initials: "R",
    avatarUrl: "https://github.com/rxri.png",
    links: [
      { icon: Mail01Icon, label: "ririxi@btsearch.pl", href: "mailto:ririxi@btsearch.pl" },
      { icon: Mail01Icon, label: "dev@ririxi.dev", href: "mailto:dev@ririxi.dev" },
      { icon: GithubIcon, label: "GitHub", href: "https://github.com/rxri" },
    ],
  },
];

const editors: TeamMember[] = [
  {
    name: "Adam Kukulski",
    role: "Edytor bazy danych",
    description: "Logi lub zdjęcia potwierdzające zgłoszenie, pytania związane z danymi w bazie.",
    initials: "A",
    avatarUrl: "/uploads/62297db8-6093-4477-861c-637973a16ff3.webp",
    links: [{ icon: Mail01Icon, label: "a.kukulski@btsearch.pl", href: "mailto:a.kukulski@btsearch.pl" }],
  },
  {
    name: "Michał Deneka",
    role: "Edytor bazy danych",
    description: "Logi lub zdjęcia potwierdzające zgłoszenie, pytania związane z danymi w bazie.",
    initials: "M",
    links: [{ icon: Mail01Icon, label: "m.deneka@btsearch.pl", href: "mailto:m.deneka@btsearch.pl" }],
  },
  {
    name: "Wiktoria",
    role: "Edytor bazy danych",
    description: "Logi lub zdjęcia potwierdzające zgłoszenie, pytania związane z danymi w bazie.",
    initials: "W",
    links: [
      {
        icon: Mail01Icon,
        label: "w.gawrysiuk@btsearch.pl",
        href: "mailto:w.gawrysiuk@btsearch.pl",
      },
    ],
  },
  {
    name: "Gabriel",
    role: "Edytor bazy danych",
    description: "Logi lub zdjęcia potwierdzające zgłoszenie, pytania związane z danymi w bazie.",
    initials: "G",
    links: [
      {
        icon: Mail01Icon,
        label: "g.bilnik@btsearch.pl",
        href: "mailto:g.bilnik@btsearch.pl",
      },
    ],
  },
];

function ContactPage() {
  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="max-w-4xl space-y-10">
        <section className="space-y-4">
          <h1 className="text-2xl font-bold">Kontakt</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Masz pytania, sugestie lub chcesz nawiązać współpracę? Skontaktuj się z nami za pośrednictwem poniższych kanałów lub bezpośrednio z
            członkami zespołu.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Zespół</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teamMembers.map((member) => (
              <Card key={member.name}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Avatar size="lg">
                      {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.name} />}
                      <AvatarFallback>{member.initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <CardTitle className="truncate">{member.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{member.role}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{member.description}</p>
                  {member.links.length > 0 && (
                    <div className="space-y-2">
                      {member.links.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <HugeiconsIcon icon={link.icon} className="size-4 shrink-0" />
                          <span className="truncate">{link.label}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Edytorzy</h2>
          <p className="text-sm text-muted-foreground">Tutaj znajdziesz kontakt do naszych edytorów</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {editors.map((member) => (
              <Card key={member.name}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Avatar size="lg">
                      {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.name} />}
                      <AvatarFallback>{member.initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <CardTitle className="truncate">{member.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{member.role}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{member.description}</p>
                  {member.links.length > 0 && (
                    <div className="space-y-2">
                      {member.links.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <HugeiconsIcon icon={link.icon} className="size-4 shrink-0" />
                          <span className="truncate">{link.label}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Zgłoszenia lokalizacji BTS</h2>
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-3">
              <HugeiconsIcon icon={SentIcon} className="size-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Zgłoszenia nowych lokalizacji i poprawki</p>
                <p className="text-sm text-muted-foreground">
                  Zgłoszenia nowych lokalizacji oraz poprawki do istniejących wpisów z bazy możesz przesłać bezpośrednio przez{" "}
                  <Link to="/submission" className="text-primary underline hover:opacity-80">
                    formularz zgłoszeniowy
                  </Link>
                  . <strong>Dziękujemy!</strong>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-2">
            <div className="flex items-start gap-3">
              <HugeiconsIcon icon={Alert02Icon} className="size-5 shrink-0 text-yellow-500 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Uwaga</p>
                <p className="text-sm text-muted-foreground">
                  Uwagi dotyczące rozmieszczenia stacji bazowych na mapie - ich współrzędnych GPS i dokładnych lokalizacji prosimy zgłaszać
                  bezpośrednio na adres Urzędu Komunikacji Elektronicznej:{" "}
                  <a href="mailto:wykazGSM_UMTS@uke.gov.pl" className="text-primary underline hover:opacity-80">
                    wykazGSM_UMTS@uke.gov.pl
                  </a>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Projekt</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <a
              href="https://github.com/btsearch/btsearch"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <HugeiconsIcon icon={GithubIcon} className="size-5 shrink-0" />
              <div>
                <p className="text-sm font-medium">GitHub</p>
                <p className="text-xs text-muted-foreground">btsearch/btsearch</p>
              </div>
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}

export const Route = createFileRoute("/_layout/contact")({
  component: ContactPage,
  staticData: {
    title: "Kontakt",
  },
});
