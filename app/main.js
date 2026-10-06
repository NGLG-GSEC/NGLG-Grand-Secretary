// Ψηφιακή Μεγάλη Γραμματεία — σημείο εκκίνησης. Εδώ δηλώνονται οι ενότητες της εφαρμογής (μία ανά αρχείο στο modules/).
// Για νέα ενότητα: δημιουργήστε modules/<όνομα>.js με module({...}) και προσθέστε το import παρακάτω.
import { start } from './core/app.js';
import { boot } from './core/connect.js';
import './modules/home.js';
import './modules/letters.js';
import './modules/decrees.js';
import './modules/members.js';
import './modules/epeteirida.js';
import './modules/provinces.js';
import './modules/lodges.js';
import './modules/directory.js';
import './modules/visits.js';
import './modules/namedays.js';
import './modules/projects.js';
import './modules/database.js';
import './modules/settings.js';

await boot();
start();
