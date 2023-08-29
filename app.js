const express = require('express');
var requestIp = require('request-ip');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser')
const fs = require('fs');
const cookieParser = require('cookie-parser');
const session = require('express-session');
var database = require('sqlite3');
var favicon = require('serve-favicon');
//const { redirect } = require('express/lib/response');

const app = express();
app.use(favicon(__dirname + '/public/favicon.ico'));

app.use(cookieParser());
app.use(session({ secret: 'secret_discret', saveUninitialized: true, resave: true }));
const port = 6789;

// directorul 'views' va conține fișierele .ejs (html + js executat la server)
app.set('view engine', 'ejs');
// suport pentru layout-uri - implicit fișierul care reprezintă template-ul site-ului este views/layout.ejs
app.use(expressLayouts);
// directorul 'public' va conține toate resursele accesibile direct de către client (e.g., fișiere css, javascript, imagini)
app.use(express.static('public'))
// corpul mesajului poate fi interpretat ca json; datele de la formular se găsesc în format json în req.body
app.use(bodyParser.json());
// utilizarea unui algoritm de deep parsing care suportă obiecte în obiecte
app.use(bodyParser.urlencoded({ extended: true }));


const bigBoss=function(req,res,next){
    if(req.session.next!=null && !req.session.next){
        switch(checkAccess(req,res))
        {
            case "ip":
                req.session.next = true;
                res.redirect('/banned-ip');
                break;
            case "user":   
                req.session.next = true;
                res.redirect('/banned-user');
                break;
            case "ok":
                next();
                break;
        }
    }
    else
    { 
        req.session.next = false;
        next();
    }
    
}
app.use(bigBoss);

// la accesarea din browser adresei http://localhost:6789/ se va returna textul 'Hello World'
// proprietățile obiectului Request - req - https://expressjs.com/en/api.html#req
// proprietățile obiectului Response - res - https://expressjs.com/en/api.html#res

//#region Global variables
var listaIntrebari = []
fs.readFile('intrebari.json', (err, data) => {
    if (err) throw err;
    listaIntrebari = JSON.parse(data)["intrebari"];
});

var utilizatori = []
fs.readFile('utilizatori.json', (err, data) => {
    if (err) throw err;
    utilizatori = JSON.parse(data)["conturi"];
});

var db;
var dbLoaded = false;
var dbCreated = false;
var dbShowed=false;
var productList = []
var albume=[{
    nume: 'CTC - Dificultăți tehnice',
    pret: 90
},
{
    nume: 'Deliric - Deliric X Silent Strike I',
    pret: 60
},
{
    nume: 'Deliric - Deliric X Silent Strike II',
    pret: 70
},
{
    nume: 'Doc - Eu',
    pret: 40
},
{
    nume: 'B.U.G Mafia - Întotdeauna pentru totdeauna',
    pret: 200
}]
var adminList=['admin']
var blackList={}
var blackListTries={}
var productCount=5;


//#endregion


app.get('/', (req, res) => {
    productList=[]
    if (dbLoaded==true) {
        db.all("SELECT * from produse;", function (err, rows) {
            if (err) return console.log(err.message);
            rows.forEach(row => {
                productList.push(row);
            });
            res.render('index', { username: req.session.username, products: productList });
        });
    }
    else {
        res.render('index', { username: req.session.username, products: productList });
    }
});

// la accesarea din browser adresei http://localhost:6789/chestionar se va apela funcția specificată
app.get('/chestionar', (req, res) => {
    // în fișierul views/chestionar.ejs este accesibilă variabila 'intrebari' care conține vectorul de întrebări
    res.render('chestionar', { intrebari: listaIntrebari, raspunsuri: req.body, username: req.session.username });
});

app.get('/rezultat-chestionar', (req, res) => {
    var total = listaIntrebari.length;
    var corecte = req.query.corecte;
    res.render('rezultat-chestionar', { total: total, rezultat: corecte, username: req.session.username });
});

app.post('/rezultat-chestionar', (req, res) => {
    let body = req.body;
    let corecte = 0;
    for (let i = 0; i < listaIntrebari.length; i++) {
        let current = body["q" + i];
        if (current == listaIntrebari[i].corect) {
            corecte++;
        }
    }
    res.redirect('/rezultat-chestionar?corecte=' + corecte);
});

app.get('/autentificare', (req, res) => {
    
    res.render('autentificare', { errorMsg: req.cookies['mesajEroare'] });
})

app.get('/logout', (req, res) => {
    if (req.session.username != undefined) {
        res.clearCookie('utilizator');
        res.clearCookie("connect.sid");
        req.session.destroy();
    }
    res.redirect('/');
})

app.post('/verificare-autentificare', (req, res) => {
    console.log(req.body);

    let logged = false
    for (let i = 0; i < utilizatori.length; i++) {
        if (req.body["username"] == utilizatori[i]["utilizator"] && req.body["password"] == utilizatori[i]["parola"]) {
            
            logged = true
            req.session.username = req.body["username"];
            req.session.nume = utilizatori[i]["nume"];
            req.session.prenume = utilizatori[i]["prenume"];
            delete req.session.fails;
            delete req.session.firstFail;
            res.cookie("utilizator", utilizatori[i]["utilizator"]);
            if(req.body["username"]=='admin'){
                res.redirect("/admin");
                break;
            }

            res.redirect("/");
            break;
        }
    }
    if (logged == false) {
        if(req.session.fails==null)
        {
            req.session.fails=1
            req.session.firstFail=Date.now();
        }
        else if(req.session.fails < 4)
        {
            console.log(req.session.firstFail+20000);
            console.log(Date.now());
            if(req.session.firstFail+20000<Date.now()){
                req.session.fails=0;
                req.session.firstFail=Date.now();
            }
            req.session.fails+=1
        }
        else
        {
            blackList[requestIp.getClientIp(req)]=[Date.now(),Date.now()+10000];
            req.session.fails=0;
            delete req.session.firstFail;
        }

        res.cookie("mesajEroare", "Utilizator sau parolă greșită! Mai ai "+parseInt(5-req.session.fails) +" încercări.", { maxAge: 4000 });
        res.redirect("/autentificare");
    }

})

app.get('/creare-bd', (req, res) => {
    db = new database.Database('cumparaturi.db');
    if (dbCreated==false){
        db.serialize(function () {
            db.run("DROP TABLE IF EXISTS produse", (result, err) => {
                if (err) return console.log(err.message);
                db.run("CREATE TABLE IF NOT EXISTS produse (ID INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, nume text not null, pret integer not null)", (result, err) => {
                    if (err) return console.log(err.message);
                    console.log("Tabela produse a fost creata!");
                    dbCreated = true;
                });
            });
        })
    }
    res.redirect("/");
})

app.get('/inserare-bd', (req, res) => {
    db = new database.Database('cumparaturi.db');
    insertDatabase(db);
    res.redirect('/');
})

function insertDatabase(db) {
    if (dbLoaded==false) {
        var insertQuery = db.prepare("INSERT INTO produse(nume,pret) VALUES (?,?)", (statement, err) => {
            if (err) return console.log(err);
        });
        for (var i = 0; i < albume.length; i++) {
            insertQuery.run(albume[i].nume, albume[i].pret);
        }
        insertQuery.finalize();
        dbLoaded = true;
    }
}

app.post('/inserare-produs', (req, res) => {
    db = new database.Database('cumparaturi.db');

    var insertQuery = db.prepare("INSERT INTO produse(nume,pret) VALUES (?,?)", (statement, err) => {
        if (err) return console.log(err);
    });
    insertQuery.run(req.body.nume, req.body.pret);
    insertQuery.finalize();

    res.redirect('/admin');
});

app.post('/adaugare_cos', (req, res) => {
    let id = req.body.id;
    console.log(id);
    if (!req.session.shoppingCart) {
        req.session.shoppingCart = [];
    }
    console.log(req.session.shoppingCart);

    let exists = false;
    for (let i in req.session.shoppingCart) {
        if (req.session.shoppingCart[i].id == id) {
            let cantitate = req.session.shoppingCart[i].cantitate + 1;
            req.session.shoppingCart[i].cantitate = cantitate;
            exists = true;
            res.redirect('/');
            return;
        }
    }

    if (exists == false) {
        req.session.shoppingCart.push({
            id: id,
            cantitate: 1
        });
    }
    res.redirect('/');
})

app.get('/vizualizare-cos', (req, res) => {
    let products = [];
    let cos = [];
    if (req.session.shoppingCart) {
        cos = req.session.shoppingCart;
    }
    db = new database.Database('cumparaturi.db');
    

    if (cos.length > 0)
    {
        db.all("SELECT * from produse", function(err, rows) {
            if (err) return console.log(err.message);
            rows.forEach(row => {
                for (let index in cos) {
                    if (parseInt(row.ID) == parseInt(cos[index].id)) {
                        products.push(row);
                    }
                }
            });
            console.log(cos);
            res.render('vizualizare-cos.ejs', { products: products, cart: cos, username: req.session.username });
        });
    } else
        res.render('vizualizare-cos.ejs', { products: products, username: req.session.username });
});

app.get('/admin', (req, res) => {
    if(req.session.username==null || req.session.username!="admin")
    {
        res.redirect(403,"/");
        return;
    }
    res.render("admin.ejs",{username: req.session.username});
});

app.get('/banned-ip',(req,res)=>{
    var clientIp = requestIp.getClientIp(req);
    if (blackList.length==0 || blackList[clientIp]==null){
        res.redirect("/");
        return;
    }
    res.render("banned.ejs",{timp:parseInt((blackList[clientIp][1]-Date.now())/1000)});
});

app.get('/banned-user',(req,res)=>{
    if (blackList.length==0 || blackList[req.session.username]==null){
        res.redirect("/");
        return;
    }
    res.render('banned.ejs',{timp:parseInt((blackList[req.session.username][1]-Date.now())/1000)});
});


function ban(req){
    const time=Date.now()

    if(req.session.username==null)
    {
        var clientIp = requestIp.getClientIp(req);
        if(blackListTries[clientIp]==null)
        {
            blackListTries[clientIp]=1;
        }
        else if(blackListTries[clientIp]!=5)
        {
            blackListTries[clientIp]+=1;
        }
        else if(blackListTries[clientIp]==5)
        {
            blackList[clientIp]=[time,time+10000]
            return "ip"
        }
    }
    else
    {
        if(blackListTries[req.session.username]==null)
        {
            blackListTries[req.session.username]=1;
        }
        else if(blackListTries[req.session.username]!=5)
        {
            blackListTries[req.session.username]+=1;
        }
        else if(blackListTries[req.session.username]==5)
        {
            blackList[req.session.username]=[time,time+10000]
            return "user"
        }
    }
    return "ok"

};

function checkAccess(req,res){
    var clientIp = requestIp.getClientIp(req);
    if(req.session.username==null)
    {
        if (blackList[clientIp]!=null)
        {
            if(parseInt(blackList[clientIp][1])<Date.now())
            {
                delete blackList[clientIp];
                return "ok";
            }
            else
                return "ip";
        }
    }
    else
    {   
        if (blackList[req.session.username]!=null)
        {
            if(parseInt(blackList[req.session.username][1])<Date.now())
            {
                delete blackList[req.session.username];
                return "ok";
            }
            else
                return "user";
        }
    }
    return "ok";
}

app.all('*', (req, res) => {
    switch(ban(req)){
        case "ip":
                res.redirect('/banned-ip');
                break;
        case "user":   
                res.redirect('/banned-user');
                break;
        case "ok":
                res.redirect('/')
                break;
    }
});


app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:`));