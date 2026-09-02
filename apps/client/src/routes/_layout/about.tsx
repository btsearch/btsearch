import { createFileRoute } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import NetWorksIcon from "@/features/station-details/components/logos/networks.svg?react";
import OrangeIcon from "@/features/station-details/components/logos/orange.svg?react";
import PlayIcon from "@/features/station-details/components/logos/play.svg?react";
import PlusIcon from "@/features/station-details/components/logos/plus.svg?react";
import TmobileIcon from "@/features/station-details/components/logos/t-mobile.svg?react";
import { SI2PEMLogo } from "@/features/station-details/components/si2pemLogo";
import { APP_NAME } from "@/lib/api";
import { buildStaticPageHead } from "@/lib/seo";

const markdownClasses =
  "space-y-4 text-sm text-muted-foreground [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-foreground [&_p]:leading-relaxed [&_a]:text-primary [&_a]:underline [&_a:hover]:opacity-80 [&_strong]:text-foreground";

const historyEvents = [
  {
    date: "Marzec 2000",
    title: "Początki",
    content:
      "Pierwotna koncepcja stworzenia internetowej bazy danych o BTS-ach, początkowo głównie z regionu zachodniego (Zielona Góra i woj. lubuskie). W bardzo krótkim czasie z pomocą ochotników z różnych zakątków kraju koncepcja ewoluuje do statusu ogólnopolskiej wyszukiwarki - btsearch.org.",
  },
  {
    date: "Lipiec 2005",
    title: "Rozbudowa zespołu",
    content:
      "Do trzonu zespołu BTSearch dołącza Krzysztof Niemczyk, który zostaje odpowiedzialny za bieżące uzupełnianie bazy, a w chwili obecnej piastuje pieczę głównego administratora bazy danych i serwisu BTSearch.",
  },
  {
    date: "2006",
    title: "Start Galerii BTS",
    content: "Uruchomienie Galerii BTS umożliwiającej nadsyłanie zdjęć stacji bazowych w Polsce i nie tylko.",
  },
  {
    date: "Styczeń 2007",
    title: "Rejestracja domeny",
    content: "Rejestracja domeny btsearch.pl.",
  },
  {
    date: "Wrzesień 2007",
    title: "Mapa pozwoleń UKE",
    content:
      "Pod adresem mapa.btsearch.pl startuje mapa pozwoleń radiowych wydanych przez Urząd Komunikacji Elektronicznej, która zyskuje sporą popularność wśród entuzjastów sieci komórkowych w Polsce.",
  },
  {
    date: "Listopad 2009",
    title: "Połączenie danych UKE i BTS",
    content:
      "Po długiej i mozolnej pracy polegającej na ręcznym skorelowaniu pozwoleń UKE z danymi z bazy BTSearch, mapa lokalizacji UKE wzbogaca się o funkcję wyświetlania lokalizacji stacji bazowych BTS zgromadzonych w bazie danych BTSearch.",
  },
  {
    date: "Listopad 2013",
    title: "BTSearch v2",
    content:
      'Uruchomienie serwisu BTSearch "v2" łączącego mapę lokalizacji BTS / UKE oraz bazę danych z wyszukiwarką stacji bazowych pod jednym dachem. Pierwsza gruntowna modernizacja serwisu od ponad 13 lat.',
  },
  {
    date: "Kwiecień 2026",
    title: "BTSearch v3",
    content:
      "Po kolejnych 13 latach, dzięki wybitnemu zaangażowaniu świeżej krwi ze społeczności open source w osobie “ririxi”, powstaje nowoczesna, responsywna i rozbudowana o szereg nowych funkcjonalności trzecia generacja serwisu BTSearch. To szczególny kamień milowy dla serwisu także z uwagi na udostępnienie publicznego API, umożliwiającego wykorzystanie danych BTSearch w aplikacjach zewnętrznych.",
  },
];

const aboutContent = `Serwis ${APP_NAME} dedykowany jest w głównej mierze osobom pasjonującym się technologiami powiązanymi z sieciami komórkowymi, a w szczególności z warstwą radiową tychże sieci. Serwis, a zwłaszcza mapa lokalizacji, może stanowić także pożyteczne kompendium wiedzy dla wszystkich osób zainteresowanych lokalizacjami nadajników BTS w Polsce i potencjalną dostępnością usług w ich okolicach.

Pierwotnym założeniem serwisu było stworzenie uniwersalnej bazy danych oraz wyszukiwarki stacji bazowych sieci komórkowych w Polsce. Niemal wszystkie dane w bazie zostały zgromadzone wysiłkiem pasjonatów GSM-u z różnych zakątków Polski, którzy wyposażeni w odpowiedni sprzęt mozolnie gromadzą i dostarczają informacje o nadajnikach BTS w ich okolicach.`;

const authors = [
  {
    name: "Krzysztof Niemczyk",
    initials: "KN",
    description:
      "Odpowiedzialny za utrzymywanie serwisu oraz bazy danych w należytym porządku, zagadnienia merytoryczne oraz ew. współpracę z podmiotami zewnętrznymi.",
  },
  {
    name: "Dawid Lorenz",
    initials: "DL",
    description: "Pomysłodawca i ojciec założyciel BTSearch. Aktualnie nie pracuje na bieżąco nad serwisem.",
  },
  {
    name: "ririxi",
    initials: "R",
    image: "https://github.com/rxri.png",
    description: "Opiekun techniczny projektu, odpowiedzialny za rozwój i utrzymanie serwisu oraz kwestie techniczne.",
  },
];

const thanksContent = `Przede wszystkim serdecznie dziękujemy wszystkim "łowcom BTS-ów", którzy bezinteresownie przysyłali dane o stacjach bazowych i bez których baza danych BTSearch byłaby po prostu pusta.`;

function AboutPage() {
  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar p-4">
      <div className="max-w-4xl space-y-10">
        <section className="space-y-4">
          <h1 className="text-2xl font-bold">O serwisie</h1>
          <article className={markdownClasses}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aboutContent}</ReactMarkdown>
          </article>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Historia</h2>
          <Timeline defaultValue={historyEvents.length}>
            {historyEvents.map((event, index) => (
              <TimelineItem key={event.date} step={index + 1}>
                <TimelineHeader>
                  <TimelineDate>{event.date}</TimelineDate>
                  <TimelineTitle>{event.title}</TimelineTitle>
                </TimelineHeader>
                <TimelineIndicator />
                <TimelineSeparator />
                <TimelineContent>{event.content}</TimelineContent>
              </TimelineItem>
            ))}
          </Timeline>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Autorzy</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {authors.map((author) => (
              <Card key={author.name}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Avatar size="lg">
                      {author.image && <AvatarImage src={author.image} alt={author.name} />}
                      <AvatarFallback>{author.initials}</AvatarFallback>
                    </Avatar>
                    <CardTitle>{author.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{author.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Podziękowania</h2>
          <article className={markdownClasses}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{thanksContent}</ReactMarkdown>
          </article>
        </section>

        <section className="space-y-4 border-t pt-8">
          <h2 className="text-xl font-semibold">Informacje prawne</h2>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <NetWorksIcon aria-label="NetWorks" className="size-6 shrink-0" />
            <OrangeIcon aria-label="Orange" className="h-6 w-auto shrink-0" />
            <TmobileIcon aria-label="T-Mobile" className="size-6 shrink-0" />
            <PlusIcon aria-label="Plus" className="size-6 shrink-0" />
            <PlayIcon aria-label="Play" className="h-6 w-auto max-w-20 shrink-0" />
            <SI2PEMLogo label="SI2PEM" className="h-5 shrink-0" />
          </div>
          <p className="text-sm text-muted-foreground">
            Przedstawione logo i nazwy operatorów oraz serwisu SI2PEM są własnością ich prawnych właścicieli. Wykorzystanie w serwisie {APP_NAME} ma
            wyłącznie charakter informacyjny i nie oznacza afiliacji ani poparcia ze strony tych podmiotów.
          </p>
          <p className="text-sm text-muted-foreground">
            Dane o wysokości n.p.m. pochodzą z{" "}
            <a
              href="https://open-meteo.com/en/docs/elevation-api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:opacity-80"
            >
              Open-Meteo Elevation API
            </a>
            , opartego na modelu{" "}
            <a
              href="https://doi.org/10.5270/ESA-c5d3d65"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:opacity-80"
            >
              Copernicus DEM GLO-90
            </a>{" "}
            © ESA.
          </p>
        </section>
      </div>
    </main>
  );
}

export const Route = createFileRoute("/_layout/about")({
  component: AboutPage,
  head: () => buildStaticPageHead("/about"),
  staticData: {
    title: "O serwisie",
  },
});
