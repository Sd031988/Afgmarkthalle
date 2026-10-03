# Bazar (بازار)

Online-Marktplatz für kleine Geschäfte und Heimarbeit in Afghanistan. Verkauft wird im Land und an Käufer im Ausland.

## Funktionen

- Sprachen: Dari, Paschtu, Englisch (von rechts nach links, afghanischer Kalender)
- Angebotsarten: Festpreis, Auktion, Großhandel mit Staffelpreisen
- Währungen: Afghani, US-Dollar, Euro
- Zahlungsarten: bar bei Übergabe, Mobile Money, Hawala (Absprache zwischen Käufer und Verkäufer)
- Nachrichten zwischen Käufer und Verkäufer
- Werbebereich mit kurzen Videos (bis 30 s, 15 MB) und Fotos, Melden und Moderation
- Datensparsam: öffentlich sind nur Shopname, Kontoart und Angebote; Adressen und Telefonnummern sieht nur der jeweilige Handelspartner; Ortsdaten werden aus Fotos entfernt

## Stand

Testbetrieb. Keine Zahlungsabwicklung über die Seite. Die Übersetzungen werden noch geprüft.

## Aufbau

- `index.html`: fertige Seite, gebaut aus `src/` mit `python3 build.py`
- `src/`: Stil, Inhalt, Programm, Übersetzungen
- `supabase/schema.sql`: Datenbankschema (Supabase/PostgreSQL mit Row Level Security)
- `supabase/ads.sql`: Werbebereich (Beiträge, Meldungen, Moderation)
