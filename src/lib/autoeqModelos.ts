/**
 * GERADO por scripts/gerar-autoeq.mjs -- não editar à mão.
 *
 * A correção de 5983 auscultadores medidos pelo projeto AutoEQ
 * (github.com/jaakkopasanen/AutoEq, licença MIT), ajustada às dez bandas do
 * Duotone. Uma linha por modelo: o nome, um TAB, e dez letras -- uma por banda,
 * pela ordem de BANDAS. Cada letra é um ganho em meios dB: a posição dela em
 * ALFABETO menos 20, a dividir por 2 ("k" = 0 dB, "0" = -10 dB, "E" = +10 dB).
 */
export const ALFABETO = '0123456789abcdefghijklmnopqrstuvwxyzABCDE';

export const MODELOS = `
1Custom SA02	vkhgjpfrmp
1Custom SA03	ojecjmrshk
1Custom SA05	pjedjmsojm
1MORE Aero (ANC Off)	lnlhhkjuup
1MORE Aero (ANC On)	ipnkfjhtso
1MORE Aero (transparency mode)	lnlhhkjuup
1MORE ComfoBuds Mini	okikehnxqj
1MORE Crystal Piston	ihddlqshho
1MORE Dual Driver	pieelpkoxq
1MORE EVO	pmgfjjmvln
1MORE Fit Open Earbuds S50	ulqshfeihj
1MORE Fit SE S30	ulqrhkeakt
1MORE MK801	vheineugop
1MORE Multi Unit Earphones	phfgnohmxc
1MORE Omthing Airfree 2	tdbgilquod
1MORE Penta Driver	oighoihuuh
1MORE Piston	sgcdkqrils
1MORE Piston Classic	tfccjmxkkp
1MORE Piston Fit	tojfjonehm
1MORE PistonBuds Pro	mmjhhjkuwo
1MORE PistonBuds Pro Q30	jhjjkmlisj
1MORE Quad Driver	xgcdjqokwj
1MORE Single Driver	vieflorbnr
1MORE SonoFlow	khifrgjqrr
1MORE Stylish	ijecjqrkrt
1MORE Triple Driver	kjffpnlira
1MORE Triple Driver LTNG	qifgnpkhtg
1MORE Triple Driver Over Ear	fifnmfqjlm
1MORE Voice of China	tgefloqdsq
634ears MIROAK-II	anhhoqfkqn
64 Audio A12t	jkijjlirqj
64 Audio A12t (CIEM)	glhhimjtvj
64 Audio A12t (m15 Apex module)	kjhjkjlqnh
64 Audio A12t (m20 Apex module)	ikhjljlqnh
64 Audio A12t (mX Apex module)	vhgijjmpnf
64 Audio A18s (CIEM)	midfmmkswp
64 Audio A2e	tigfjmnotq
64 Audio A4t	kjhjokerrn
64 Audio A6	hlihilmotk
64 Audio A6t	glhginlqtk
64 Audio A6t (m20 Apex module)	jjgginlrtj
64 Audio Aspire 1	hlggmmjspj
64 Audio Aspire 2	gkffmkmsjj
64 Audio Aspire 3	cmkgjjmtmi
64 Audio Aspire 4	flgglklusm
64 Audio Duo	mieelpkssh
64 Audio Fourte Blanc	gnigbnqtkd
64 Audio N8 (CIEM, m15 Apex module)	jkgfknisvl
64 Audio N8 (CIEM, m20 Apex module)	injgkmjqvl
64 Audio N8 (CIEM)	uihgkmirvl
64 Audio N8 (dd disabled)	wnogikgouj
64 Audio N8 (m15 Apex module)	hlhglllool
64 Audio N8 (m2 Apex module)	ikhflmiutc
64 Audio N8 (m20 Apex module, modded)	kplhjlgrui
64 Audio N8 (modded)	jplgjlgruh
64 Audio N8 (MX Apex module)	qiggklittc
64 Audio N8 (vent blocked)	vnphikeprh
64 Audio N8t (m15 Apex module)	ikghlllpnn
64 Audio Nio (Fir Audio black module)	kjfglknokl
64 Audio Nio (Fir Audio red module)	mifhmknokl
64 Audio Nio (m12 Apex module)	ljgglknokl
64 Audio Nio (m15 Apex module)	glhglmjqqn
64 Audio Nio (m20 Apex module)	flggmmjqro
64 Audio Nio (mX Apex module)	vjhilkhpol
64 Audio Solo	ljhhnlguld
64 Audio Tia Fourte	jnjidplskg
64 Audio Tia Fourte Noir	imhhcslskg
64 Audio Tia Trio	kkgiiqhrqc
64 Audio U12t	kkiijliqrj
64 Audio U12t (Fir Audio red module)	rhgijkkqog
64 Audio U12t (m12 Apex module)	qhgijklqng
64 Audio U12t (m15 Apex module)	glhikjkrqh
64 Audio U12t (m20 Apex module)	fmhikjksph
64 Audio U12t (mX Apex module)	shgijjlqqh
64 Audio U18S	lkhiljistk
64 Audio U18s (m20 Apex module)	ikghljmrnm
64 Audio U18t	oiffkmkrqm
64 Audio U18t (2014)	pkhgkllopj
64 Audio U18t (2017)	njfflmlqqj
64 Audio U18t (m15 Apex module)	ijeelmotjj
64 Audio U18t (m20 apex module)	pifflnksqk
64 Audio U18t (mX Apex module)	vgdeklprli
64 Audio U4S (Fir Audio black module)	kjfhlkktmf
64 Audio U4S (Fir Audio red module)	njfhlkktmf
64 Audio U4S (m12 Apex module)	lkhiljjtlf
64 Audio U4S (m15 Apex module)	hkghlkjumf
64 Audio U4S (m20 Apex module)	flfglkjunf
64 Audio U4S (mX Apex module)	tigikjjume
64 Audio U6t (m15 Apex module)	nhghjmlqth
64 Audio Volur	fmgglnkond
64 Audio Volur (m12 Apex module)	rihglkjqqd
64 Audio Volur (m15 Apex module)	kkhgllisrd
64 Audio Volur (m20 Apex module)	ilhflljtre
64 Audio Volur (mX Apex module)	wkihkkhsqc
7Hz Aurora	wkijnmenph
7Hz Eternal	mliilngktt
7Hz Five	lgdfprgqfh
7Hz G1	emhgnnmjhe
7Hz Legato	alffnnjukg
7Hz Salnotes Dioko	ipkiljhsh9
7Hz Salnotes Dioko Spring	jpkimjiqic
7Hz Salnotes Zero	knjillilpj
7Hz Salnotes Zero 2	gniimkklmj
7Hz Sonus	injinjgple
7Hz Timeless	klhinmfsja
7Hz Timeless AE	dlkhqkfofj
7Hz Timeless II	kkiinlgrke
7Hz Timeless II (bullet gold nozzle)	gmiinkdwkg
7Hz Timeless II (bullet silver nozzle)	hmiinldvkg
7Hz Timeless II (flat gold nozzle)	gmiinletif
7Hz Timeless II (flat silver nozzle)	fmhhmkitif
7Hz Timless II	kkiinlgrke
7Hz x Crinacle Zero 2	jliimmhorm
7Hz x HBB Elua	eifhkmoola
7th Acoustics Proxima	unkikjinil
7th Acoustics Stargazer	hmjjnkgokh
7th Acoustics Supernova	nkhimlhqnf
A-Audio Elite (ANC on)	pqlmr4qgmm
A-Audio Elite (bass mode)	moiil7wmvs
A-Audio Elite (passive)	jkfkmftgro
AAW (Advanced AcousticWerkes) ASH	pkhigllvmg
AAW (Advanced AcousticWerkes) Canary	ojgglijxrm
AAW A2H V2	elfdkoppou
AAW A3H	rigfjmlrrt
AAW A3H (2019)	ulgejonmfj
AAW A3H Plus	rjfeooeurk
AAW A3H V2	rjggkmguvt
AAW ACH	wmgefppprf
AAW AXH	rljhiilt8e
AAW AXH (2019)	vjiihlgxi9
AAW Halcyon (bass filter)	lkfflinulj
AAW Halcyon (norm filter)	rkfdmkmtjj
AAW Halcyon (Vokal filter)	vkedmkmuji
AAW Kingfisher	xjfefppqth
AAW Mockingbird	tkigikjwqf
AAW Nightingale	xkihhcpxtr
AAW W500	qkgflkjtss
AAW W900	rliikfluvh
AAW x Custom Art Project 4+2 (bass filter)	njgfpiitmq
AAW x Custom Art Project 4+2 (norm filter)	riffokitlq
AAW x Custom Art Project 4+2 (Vokal filter)	voicmngrlp
AAW Z02	sgegmrgqi7
AAW Z06	gmihmgpopi
Abyss AB-1266	rjmhmbptj7
Abyss AB-1266 Phi	silhmapuoa
Abyss AB-1266 Phi CC	tjlgn8tppd
Abyss AB-1266 Phi CC Lite	rkkgn9snoe
Abyss AB1-266 Phi TC	rlkhnboqnf
Abyss Diana MR	uhjikgnpke
Abyss Diana Phi	skjimdomol
Abyss Diana V2	vijileltnl
Accidentally Extraordinary 51st Studios	udderfoqvp
Accidentally Extraordinary Bamboo	xieclsexin
ACEFAST Crystal T8	fdaenmtmoq
Acoustic Research AR-H1	vmiikfnqhg
Acoustune HS1001	ckdcmrpmfo
Acoustune HS1003	flffmpogfm
Acoustune HS1004	oiffmljvel
Acoustune HS1300	mkghnohlon
Acoustune HS1501	mjfgnnfuiq
Acoustune HS1503	blfenprecm
Acoustune HS1551	pjffnngwjs
Acoustune HS1650	kkfipmfpml
Acoustune HS1655	jkfgpnhokl
Acoustune HS1657	jlgjnmfojm
Acoustune HS1670	qkghpleqkk
Acoustune HS1677	mkghpmfoim
Acoustune HS1695	sjfinjjqil
Acoustune HS1697	rkffqgmqin
Acoustune HS1750	ojfjolgoom
Acoustune HS1790	vkggohjplm
Acoustune HS2000MX	tkiihjqlem
Acoustune RS ONE	kjefnqlkeo
Adam SP-5	vbhlokeq9h
Advanced 747 (ANC off)	fkcaiuqpnr
Advanced 747 (ANC on)	fg99jusqos
Advanced Alpha (shallow earpads)	tlkhlnnboh
Advanced Elise	gibajrrtlk
Advanced Evo X	rkgenohris
Advanced Furai	lkkimmdors
Advanced GT-R	rkhggjovrh
Advanced GT3 (bass)	jmgejnshdf
Advanced GT3 (ref)	kmhekoseef
Advanced GT3 (treble)	lmhfkprdff
Advanced GT3 Superbass (bass)	jmhehisrwn
Advanced GT3 Superbass (ref)	jmifiisnxo
Advanced GT3 Superbass (treble)	jmifiismxo
Advanced M3	ekdclsnmur
Advanced M4	pkfelpmlij
Advanced M51D	xnjhgmiqvo
Advanced M55D	klgeilouef
Advanced Model X	8kdcmpqocs
Advanced S2000	flggnsejyp
Advanced Sleeper	ekhinoayql
Aedle VK1	zfbjolevss
AfterShokz Aeropex	ulv8crpgfg
AfterShokz Trekz Air	umr8klv6gf
AFUL Acoustics Cantor	gnjjkgmrid
AFUL Acoustics MagicOne	sjghlmkmjg
AFUL Acoustics Performer 5+2	gmhhmjlrjd
AFUL Cantor	kljjlhlqic
AFUL Explorer	fnihlijvmj
AFUL Explorer 3	hmihlimqlq
AFUL MagicOne (foam eartips)	rifhlmkokl
AFUL Performer 5	lliimijplg
AFUL Performer 7	lkhimhjsnf
AFUL Performer 8	rjiklgjsqg
Agasound AGA ONE	ilggnplenj
Aiaiai TMA-1	wbfciivsou
Aiaiai TMA-1 Studio	vbffkhtpok
Aiaiai TMA-2 DJ	off9ikxtrt
Aiaiai TMA-2 HD Wireless	pidbmlsppq
Aiderlot M5 (bass filter)	ulihmkgrmp
Aiderlot M5 (no filter)	vljimleokl
Aiderlot M5 (reference filter)	uljimlepkl
Aiderlot M5 (treble filter)	vljimleplm
Aiderlot M5 Pro	flfiqmhitr
Akai MPC	skijngmkuq
AKG K1000	tmflnlflci
AKG K167 Tiesto	tlnmkfhnif
AKG K240 MKII	vnffjmmqjl
AKG K240 Monitor	xighjmoitk
AKG K240 Sextett	vjafkonpdp
AKG K240 Sextett (Dekoni Choice Leather DT earpads)	nf8bmqsohq
AKG K240 Studio	voifiknqjk
AKG K240DF	vomgjkmhqe
AKG K250	wogilnenui
AKG K267	so9kofnqpp
AKG K267 Tiesto (club)	pohkngjppl
AKG K267 Tiesto (stage)	kmghqijppm
AKG K267 Tiesto (studio)	tohjmflool
AKG K271 MKII	uksifjdwfj
AKG K272HD	xelhhilulk
AKG K280 Parabolic	wkiihknlpo
AKG K3003	lledkmpthn
AKG K3003 (bass boost filter)	qhdcjpqpmp
AKG K3003 (high boost filter)	ujffkmpjfh
AKG K3003 (reference filter)	viffklnpik
AKG K340	voielpinjf
AKG K361	glgjmkislk
AKG K371	gpjhmjkqjp
AKG K371 (Brainwavz oval earpads)	conllghpim
AKG K376	8mfenqllqr
AKG K44	ufigkbrxif
AKG K450	xhihigydxq
AKG K501	tnkjnjjfik
AKG K518LE	whfgohnnto
AKG K52	br8enjxmfk
AKG K550	lnihnjlogh
AKG K553	epdhmlmpjl
AKG K601	unlimoblml
AKG K601 (2007)	tnkhllkgei
AKG K601 (Dekoni sheepskin earpads)	wggenpetjl
AKG K601 (K701 earpads)	wkjhmodmol
AKG K612	vkjhmohjkl
AKG K612 Pro	vkjgmohjko
AKG K619	aimmidnstn
AKG K67 Tiesto	ijatobnojk
AKG K701	uhiekqiojn
AKG K701 (sample A)	uligkmmkgm
AKG K701 (sample B)	umignmkiei
AKG K702	vjjgmpfmjn
AKG K702 (Brainwavz XL earpads)	qifcprdrln
AKG K702 (Geekria earpads)	unmjnobjij
AKG K702 65th Anniversary Edition	viigioipgo
AKG K712	uhhggrknjn
AKG K712 (Dekoni sheepskin earpads)	siidlrfsjl
AKG K712 PRO	uliiiqgngj
AKG K72	hqbcgoymeq
AKG K7XX	qhhdjpmpkr
AKG K81 DJ	vhfhqikmoj
AKG K812	sjhgjjthhk
AKG K812 (serial number 001130)	qihfjlvffm
AKG K872	rgbjmisikq
AKG K872 Pro	xn8gmjsint
AKG K92	dw9cfpynip
AKG N20	miefmqjnfk
AKG N200	igikmmjlfd
AKG N400	ikkkklljhk
AKG N5005	imliknjinj
AKG N5005 (bass boost)	imlhkliprn
AKG N5005 (high)	imlikniinj
AKG N5005 (mid high)	imlikmilok
AKG N5005 (reference)	imlikliool
AKG N60 NC (wired, passive)	mkgimnmfyq
AKG N60 NC Wireless	xgdipkr7np
AKG N700NC	mllmnmhddh
AKG N700NC M2	fljikmmlql
AKG N700NC M2 (ANC on)	gmjgnliqrk
AKG N700NC M2 (passive)	djaethvjnm
AKG N9 Hybrid	ah9lnplmjh
AKG N9 Hybrid (ANC on, studio preset)	eihllmkkjh
AKG N9 Hybrid (ANC on)	bhglmnklkh
AKG N9 Hybrid (passive)	cl0hulrpil
AKG N90Q	qnkkklo9od
AKG Q350 Quincy Jones	jhcckpxhdn
AKG Q460 Quincy Jones	ugidjixfxr
AKG Q701	vkihlpeoik
AKG Q701 Quincy Jones	umjhmngkek
AKG Y50BT	uemniflkkl
Akoustyx R-120	unlilkkglh
Akoustyx R-220	unnhlkgmjg
Akoustyx S-6	9qkioql7ge
Alclair Electro	kmigmikspt
Alclair Studio3	mkggnjlnpt
Alclair Studio4	nlhejjpqpt
Alclair Versa	mkedjnosmq
Allen & Heath XD-53	wngkxbektj
Alpha & Delta AD01	dlgfmniqtl
Alpha & Delta D6	flielmrhht
Alpha & Delta KS1	gmhhonioem
Alpha & Delta KS100	dgllklldsl
Alpha & Delta KS3	wmihmr7rrp
Alpha Design Labs H128	offgkjosss
Alpha Omega Omega (off-off-off)	7niiojkprg
Alpha Omega Omega (off-off-on)	9okkpjhlnc
Alpha Omega Omega (off-on-off)	bpljojhmpg
Alpha Omega Omega (off-on-on)	bpljojhloe
Alpha Omega Omega (on-off-on)	7njjpkimod
Alpha Omega Omega (on-on-off)	8mhhnjlqsj
Alpha Omega Omega (on-on-on)	8mhhnjlprh
Alpha Omega Omega on-off-off)	6mhhojlqsh
Alpha Omega Ra	cpljnhiorm
Altec Lansing True Evo	pe3erpqnfj
Altiat Cal.1H	uegfgkzefp
Amazon Echo Buds	dfrnikgjqh
Amazon Echo Buds Gen 2	rfunflfjgg
Amazon Echo Buds Gen 3	umgkjnkiej
AmazonBasics Lightweight On Ear	iggpjdotem
Ambient Acoustics AM16	qjhgmjksfo
Ambient Acoustics AM24	rjhfkhmvmo
Ambient Acoustics AM7	wkhhlraqoq
Ambient Acoustics AM7 (blue)	rjgfmtcrrq
Ambient Acoustics AM7 (red)	mjfelvdsrr
Ambient Acoustics AM7 (yellow)	wnllom4stq
Ambient Acoustics MAD16	mkfdktftum
Ambient Acoustics MAD24	mjediqlwnm
Ambient Dynamics AD-006 Lyndale	olhelnjqts
AME Aura	lkfgnljrth
AME Gaia	hnhipnfmoa
AME Mousa	ijeelpnnii
AME Radioso	dpjhokhrq9
AME Raven KR version	qjhjpldoqe
Andover Audio PM-50 (medium squared earpads)	vijikgjvqn
Andover Audio PM-50 (small rounded earpads)	viihkcnwsp
Anew U1	elggolgwdl
Anker Liberty 4 Pro	gjgkknhsni
Anker Liberty 5	kajsfngmmm
Anker Life P2i	chgjnmiptg
Anker P3i	dhglrlcsdj
Anker SoundBuds Curve	5qcmmlojip
Anker SoundBuds Curve Upgraded 2019	cjekrkkiil
Anker SoundBuds Life	ameiqombjr
Anker SoundBuds Sport	yc7blpquoe
Anker Soundcore Aerofit Pro	umnpklahku
Anker Soundcore C30i	ulqsfjh8jv
Anker Soundcore Liberty 2 Pro	6kdlnsflgb
Anker Soundcore Liberty 3 Pro	bjhmondn75
Anker Soundcore Liberty 4	pgflskdn00
Anker Soundcore Liberty 4 NC	8hgjnllmbl
Anker Soundcore Liberty Air	fijhnklmig
Anker Soundcore Liberty Air 2	ameinnqgke
Anker Soundcore Liberty Air 2 Pro	8khlinmo4j
Anker Soundcore Liberty Lite	boejplkkkd
Anker Soundcore Life 2	dhfqmjkjee
Anker Soundcore Life A2 NC	ajbjmtho79
Anker Soundcore Life Dot 2	dkekmnisgc
Anker Soundcore Life P2	bidjoloij9
Anker Soundcore Life P3	4lrjjobveb
Anker Soundcore Life Q20	ceenqjlkji
Anker Soundcore Life Q30	dhbmhuhqed
Anker Soundcore Life Q30 (ANC off)	2j5gvphvi8
Anker Soundcore Life Q30 (ANC on)	dgbngritjb
Anker Soundcore Life Q35	ahdqjmexf7
Anker Soundcore Life Q35 (ANC off)	9fgiskdvkb
Anker Soundcore Life Q35 (ANC on)	4mhojndujf
Anker Soundcore Life Q35 (wired, passive)	7j80uquuqm
Anker Soundcore P25i	6ejomjfulm
Anker Soundcore P40i	97grpodk7c
Anker Soundcore Sleep A20	dgeiomlmi7
Anker Soundcore Space A40	jigijjmrgs
Anker Soundcore Space NC	5ldmsocppi
Anker Soundcore Space One	bkdosffsc7
Anker Soundcore Space Q45	emfopcko9m
Anker Soundcore Space Q45 (ANC on)	9nfolfmpmj
Anker Soundcore Space Q45 (wired, passive)	fn9goetuoq
Anker Soundcore Spirit X	9lgnmkligp
Anker Zolo Liberty+	liajrkmkeb
Anthem Five E2 (CIEM)	ckddnqnkxs
Anthem Five E4 (CIEM)	llhhmlftws
AOSHIDA E20	llpihnjikg
Apevoix Grit	glhimkmlpp
Apple AirPod 4 (transparency)	wdilmjctj9
Apple AirPods (1st generation)	rknlflhptm
Apple AirPods (2nd generation)	tnlklodjed
Apple AirPods (3rd generation)	wfjklmeolt
Apple AirPods 2	umhnom9nik
Apple AirPods 3	wgekolfnkn
Apple AirPods 4	qfhilhjymh
Apple AirPods 4 (ANC on)	qeiilhiylh
Apple AirPods Max	fmjhlgoprh
Apple AirPods Max (3rd party pleather earpads)	enliq2tumi
Apple AirPods Pro	qjmignjnle
Apple AirPods Pro 2	hmkhhknpio
Apple AirPods Pro 2 (51dB + ANC)	coihklnlko
Apple AirPods Pro 2 (56dB + ANC)	coihklnlko
Apple AirPods Pro 2 (60dB + ANC)	epihklnkkp
Apple AirPods Pro 2 (65dB + ANC)	goihklnklr
Apple AirPods Pro 2 (69dB + ANC)	ioihklnkms
Apple AirPods Pro 2 (73dB + ANC)	koihklnkmt
Apple AirPods Pro 2 (77dB + ANC)	moihklnknu
Apple AirPods Pro 2 (81dB + ANC)	nniiklmkou
Apple AirPods Pro 2 (84dB + ANC)	pnhiklmkou
Apple AirPods Pro 2 (88dB + ANC)	pnhiklmkou
Apple AirPods Pro 2 (91dB + ANC)	pniiklmkou
Apple AirPods Pro 2 (ANC mode)	lnligkmonm
Apple AirPods Pro 2 (passive mode)	omkhgkooon
Apple AirPods Pro 2 (transparency mode)	lnliglmonl
Apple EarPods	toiikngpcl
Apple In-Ear (2013)	rmigiknqth
Apple iPod Ear Buds	ultgijnehl
Apple iPod Ear Buds (sample A)	ultfijoegk
Apple iPod Ear Buds (sample B)	ulthijndjn
Apple ME186 In-Ear Headphones	qlhfjmnnuj
ARC Mira	tjgflnkoms
ARC Oculus	sjgeklkuro
ARC Pollux	vmjhkigvns
Aroma Audio Ace (off-off)	ujhgmfpojj
Aroma Audio Ace (off-on)	ujgfkgrqlm
Aroma Audio Ace (on-off)	ojeeniqpkl
Aroma Audio Ace (on-on)	pifdlirrnn
Aroma Audio Early	ljffkqjpqs
Aroma Audio Fei Wan	hmghjplpic
Aroma Audio Jewel	inijklkjvg
Aroma Audio Shock	mjedjpshym
Aroma Audio Star	pkgfjnmrlt
Aroma Audio Thunder	imhgilqnjm
Aroma Audio Twins (bass)	ojechmurol
Aroma Audio Twins (treble)	uligjnnhgg
Aroma Audio Witch Girl Pro	okgejipvpu
Aroma Audio Witch Girl S	uifejmkvou
Aroma Audio Witch Girl W12	rifdllpsmn
Aroma Audio Yao	ojedjlssmo
Arpegear Hane (off-off-off-off)	olhhmljmlf
Arpegear Hane (off-off-off-on)	pliimljlic
Arpegear Hane (off-off-on-off)	olhhllkooi
Arpegear Hane (off-on-off-off)	gmhhmlknlg
Arpegear Hane (on-off-off-off)	lmihmlkmlf
ARTTI R1	hkghoniooi
ARTTI R2	iniimjmlml
ARTTI R3	hmhhomikqm
ARTTI R6	nljimlfqrd
ARTTI T10	gnjjnlerke
ARTTI T10 Pro	kjghnmkoqd
Astell & Kern (Astell&Kern) T8iE	hkedlmormt
Astell & Kern AURA	klghnmljhe
Astell & Kern Odyssey	elffnnhumk
Astell & Kern Rosie (2 o'clock)	oiedjomvln
Astell & Kern Rosie (max)	ekcbkqnwrr
Astell & Kern Rosie (min)	riedjnnuim
Astell & Kern T9iE	hnjfjhotls
Astell & Kern x Empire Ears Novus	cmffonipmf
ASTRO Gaming A10	qbggxakvcg
ASTRO Gaming A10 (Gen 2)	viegokmlnp
ASTRO Gaming A20	qcdjoiud6h
ASTRO Gaming A20 (Gen 2)	nfkjqgneag
ASTRO Gaming A30	fnkjfolr8g
ASTRO Gaming A40 TR	sjfhjkmter
ASTRO Gaming A50 (Gen 3 2017)	thhhqhkpag
ASTRO Gaming A50 (Gen 4 2019)	vifipjineo
ASTRO Gaming A50 X	nhkllgkpil
Astrotec AM90	tligikksvl
Astrotec Archimedes	okiingezmd
Astrotec AX35	xnfeimkwos
Astrotec AX7	wnjhihksoo
Astrotec Delphinus 5	wkihkbpwtt
Astrotec Lyra Nature	wnljhemqou
Astrotec Lyra Nature (no foam)	tlqokhbndn
Astrotec Volans	lmhfmoimxr
ASUS ROG Cetra True Wireless SpeedNova	iedcAmkbex
ASUS ROG Delta S Core (fabric earpads)	wjjfgolqnk
ASUS ROG Delta S Core (leather earpads)	vhffhqkrrl
Atomic Floyd SuperDarts	9lfenlnvfg
Audeze CRBN	wkjjlhnhso
Audeze EL-8 Closed Back	rjgpnhlath
Audeze EL-8 Open Back	wjkjlhljul
Audeze Euclid	plijnkdqjq
Audeze iSINE 10	wnkjk7nAlf
Audeze iSINE 10 (Cipher cable)	wgejlkkrlc
Audeze iSINE 20	xmkjk7nAng
Audeze iSINE 20 (Cipher cable)	njkknlemuk
Audeze LCD-1	xjiiiirhxh
Audeze LCD-1 (2009)	tnlkmjmahi
Audeze LCD-2	ujjhjimqnj
Audeze LCD-2 (Dekoni fenestrated sheepskin earpads)	qjhhhhtoij
Audeze LCD-2 (Fazor)	tjiijgmulg
Audeze LCD-2 (pre-2017)	tjihihnrpj
Audeze LCD-2 (Rev 2)	tjihijpmom
Audeze LCD-2 (sample 1)	uiiihfsoql
Audeze LCD-2 (serial number 5312123)	sjigijqlnl
Audeze LCD-2 (serial number 53211704)	tjjhjipnni
Audeze LCD-2 (serial number 5325928)	ukjjjhlosj
Audeze LCD-2 Classic	vijhjdptqo
Audeze LCD-2 Closed Back	sjgjohkpjl
Audeze LCD-24	ujihjdqull
Audeze LCD-3	skihjhmuri
Audeze LCD-3 (Fazor)	xhjikilmsk
Audeze LCD-3 (Rev 2)	uijijjkpui
Audeze LCD-3 (serial number 2312260)	sjhhhkrmnk
Audeze LCD-3 (serial number 2312341)	siihhlqlqj
Audeze LCD-3 (serial number 2312454)	uijiijpkvi
Audeze LCD-3 (serial number 2312488)	tijhijqjtk
Audeze LCD-3 (serial number 2717210)	uijhkimonl
Audeze LCD-4	ujihjeouqi
Audeze LCD-4z	sljikdnupl
Audeze LCD-5	wjjjmgmhxn
Audeze LCD-GX	wiihjhkuqf
Audeze LCD-i3	ymkjj7oAph
Audeze LCD-i3 (Cipher bluetooth)	snjijdlxvo
Audeze LCD-i4	xmjiidiAqe
Audeze LCD-MX4	tkjhjdqrqn
Audeze LCD-R	vjjijhktoj
Audeze LCD-R (bass boost)	rijhkiksni
Audeze LCD-X	qlijkimnqm
Audeze LCD-X (2021)	tiihihmulj
Audeze LCD-X (Dekoni sheepskin Earpads)	tkihkgnrki
Audeze LCD-X (pre-2021)	tiigidsrlk
Audeze LCD-X (pre-2021) (worn earpads)	zgdjjilvrm
Audeze LCD-X (sample 3)	ugjgjjnnsi
Audeze LCD-X (serial number 7454971)	uijhkjlnsi
Audeze LCD-X (serial number 7456406)	uijhjknlnk
Audeze LCD-XC	vhjknigpki
Audeze LCD-XC (pre-2021)	tifirhgrkh
Audeze LCD-XC (sample 1)	sjhiqiikug
Audeze LCD-XC (sample 2)	wjilogiiqi
Audeze Maxwell	kggpjmhnhi
Audeze Maxwell (Audeze preset)	hmiinlkhti
Audeze Maxwell (bass boost preset)	cmjinmkhui
Audeze Maxwell (competition preset)	ookkmllapj
Audeze Maxwell (footsteps preset)	modnoqfcxg
Audeze Maxwell (immersive preset)	dljinmkioh
Audeze Maxwell (review eq)	enlilllhpj
Audeze Maxwell (treble boost preset)	gnijnmkgpi
Audeze MM-100	wkkjlijmyk
Audeze MM-500	ukjilikmvm
Audeze Mobius	hliiomgope
Audeze Mobius (ballistics preset)	phhfoliqwi
Audeze Mobius (default preset)	nhhhpkiovd
Audeze Mobius (flat preset)	nkhhsihmwg
Audeze Mobius (footsteps preset)	qkhepkjpuh
Audeze Mobius (music preset)	lkhfokkotg
Audeze Mobius (racing preset)	njheplipwh
Audeze Mobius (RPG preset)	qjhhqmenxh
Audeze MX-4	tkjjldoqup
Audeze Penrose	qhklikhslb
Audeze SINE	vjjjllhoqd
Audeze SINE (Cipher cable)	qjhjlmhosf
Audeze SINE (MSR-7 earpads)	wkhholgmra
Audeze SINE DX	ujkilfjtuj
Audient EVO SR2000	wafmkeoqii
Audio Genetic AG2	sjgeilnvpr
Audio Zenith PMx2 (v1)	wkhhkfqolo
Audio Zenith PMx2 (v2)	tjhjigrmmn
Audio-Technica ATH-A1000X	udgkliisvi
Audio-Technica ATH-A1000Z	wgckmilpon
Audio-Technica ATH-A2000X	yhfqmgfmug
Audio-Technica ATH-A2000Z	wgdlmiiqpl
Audio-Technica ATH-A55	uksndfmhgl
Audio-Technica ATH-A700	vleqgenrce
Audio-Technica ATH-A900	xjkqdhjnvj
Audio-Technica ATH-A900X	wgbjkgproo
Audio-Technica ATH-A990Z	qebijjtnqk
Audio-Technica ATH-AD1000X	wlhhkgsjrn
Audio-Technica ATH-AD2000	vmjgketkml
Audio-Technica ATH-AD2000X	xkihkctmul
Audio-Technica ATH-AD500	wnhimfmopl
Audio-Technica ATH-AD500X	yjfhlepoun
Audio-Technica ATH-AD700	wnkjmhkhuj
Audio-Technica ATH-AD700X	xlgileorpg
Audio-Technica ATH-AD700X (2013)	vmhimenpjf
Audio-Technica ATH-AD900	unljmgpbnn
Audio-Technica ATH-AD900X	xlfhldrorn
Audio-Technica ATH-ADX3000	umhinjngje
Audio-Technica ATH-ADX5000	vifhpftekg
Audio-Technica ATH-ADX5000 (Dekoni elite sheepskin earpads)	whgiletktl
Audio-Technica ATH-ADX5000 (Dekoni fenestrated sheepskin earpads)	wjgingqgog
Audio-Technica ATH-ADX5000 (Yaxi A2000Z,AD2000X earpads)	wifhpgqgpf
Audio-Technica ATH-ANC23	ulhehopmep
Audio-Technica ATH-ANC300TW	ujcgjrir9t
Audio-Technica ATH-ANC33iS	vjfdfrophr
Audio-Technica ATH-ANC50iS (passive)	mfe8fpxsvt
Audio-Technica ATH-ANC70	wmkiufdoqe
Audio-Technica ATH-ANC7B	sfegigttnn
Audio-Technica ATH-ANC9	gnehqoihei
Audio-Technica ATH-AWAS	xmjgkkinwo
Audio-Technica ATH-AWKT	xfjokekkui
Audio-Technica ATH-CK2000Ti	gkffmlvcjq
Audio-Technica ATH-CK3TW	dkdclqmxkg
Audio-Technica ATH-CKM500	sgcbkuphin
Audio-Technica ATH-CKN50	uhcemntfdm
Audio-Technica ATH-CKR7TW	gnjjopgegu
Audio-Technica ATH-CKS5TW	bkddmqkqwt
Audio-Technica ATH-CKX5iS	hlghonmeih
Audio-Technica ATH-CT200iS	tlprsg8b1o
Audio-Technica ATH-DSR9BT	tf8prlgjjf
Audio-Technica ATH-E70	plgejllxkr
Audio-Technica ATH-ES55	wominehpvd
Audio-Technica ATH-ESW9	wklkpcimph
Audio-Technica ATH-ESW9A	whljoejmvm
Audio-Technica ATH-EW9	unkjmpibpk
Audio-Technica ATH-FC700	unjiklgpcd
Audio-Technica ATH-FC700A	tmjjlkjnae
Audio-Technica ATH-G1	ii8gqdursj
Audio-Technica ATH-HL7BT	wjfgkewkom
Audio-Technica ATH-IEX1	hlhjuk9rsi
Audio-Technica ATH-IM01	pjfchnqsqt
Audio-Technica ATH-IM02	ukgfinhxmk
Audio-Technica ATH-IM03	qifejnlvps
Audio-Technica ATH-L5000	sihlmgmjqn
Audio-Technica ATH-LS200	skgfkoiptr
Audio-Technica ATH-LS300	jlhejlkwut
Audio-Technica ATH-LS400	okfdjonqws
Audio-Technica ATH-LS50	ijeeopevst
Audio-Technica ATH-M10	xoigicpzli
Audio-Technica ATH-M20x	wddqkjcwoj
Audio-Technica ATH-M30	wdhoimepti
Audio-Technica ATH-M30x	ogfrjlavl8
Audio-Technica ATH-M40	pghjljmjsh
Audio-Technica ATH-M40x	qfckpikpkc
Audio-Technica ATH-M50	qldmoiklpg
Audio-Technica ATH-M50x	llbmoilloh
Audio-Technica ATH-M50x (Dekoni sheepskin earpads)	lfehkkppjd
Audio-Technica ATH-M50x (Massdrop velours earpads)	phfqllihi9
Audio-Technica ATH-M50xBT	ilbixigllb
Audio-Technica ATH-M50xBT2	pibsmghrg6
Audio-Technica ATH-M60x	rhejvckljp
Audio-Technica ATH-M70x	qmhinnjglk
Audio-Technica ATH-MSR7	vhihqfjmro
Audio-Technica ATH-MSR7b	sedplgkpkl
Audio-Technica ATH-MSR7NC	tkgjskdngi
Audio-Technica ATH-MSR7NC (ANC on)	uijguggkom
Audio-Technica ATH-MSR7NC (passive)	uhihugglno
Audio-Technica ATH-PRO700	wloz76rktf
Audio-Technica ATH-R50x	ughknkjhhj
Audio-Technica ATH-R70x	whgilljprk
Audio-Technica ATH-R70xa	viflniioni
Audio-Technica ATH-SPORT7TW	tbcimnkoes
Audio-Technica ATH-W1000X	zfciohkpwh
Audio-Technica ATH-W5000	yiiiohgoxn
Audio-Technica ATH-W5000 2013	xkefsekpnf
Audio-Technica ATH-WS55	qedfpdpxmk
Audio-Technica ATH-WS99	sgecqjmroq
Audio-Technica BPHS1	wninoeaxnd
AudioFly Adagio Club Life	wkihmhmpot
AudioFly AF140	njedlqhuqh
AudioFly AF160	vlihjjkpys
AudioFly AF180	skgfiiqttn
AudioQuest NightHawk	nlccgqspmj
AudioQuest NightHawk (Brainwavz HM5 hybrid earpads)	unkgfpodjh
AudioQuest NightHawk (Shure SRH1540 alcantara earpads)	pnfdfqrhrk
AudioQuest NightOwl	mobfjfxrrm
Audiosense AQ3	cpifkomlsk
Audiosense AQ4	emhglojptp
Audiosense AQ7	jmjlqfdrwo
Audiosense DT100	nkgfjolous
Audiosense DT200	nlhgkokmvi
Audiosense DT300	jlgdilputg
Audiosense DT600	cnmginjoxr
Audiosense DT600 (80 ohm resistor)	dopkmmcloe
Audiosense T180	ukhgjmohiu
Audiosense T180 Pro	plihknlhxq
Audiosense T800	hmihmojkxk
AuGlamour F300	hkfgnolhup
AuGlamour RT-3	hmghophhul
AuGlamour T100	hldckoqpgp
AUKEY EP-B44	7oignqhplg
AUKEY Latitude	klfdnktjek
AUKEY Latitude (balanced)	mhdemntffq
AUKEY Latitude (bass)	jhcclmuqbp
AUKEY Latitude (treble)	ukiiqip6ku
AUNE AR5000	uihfjjrjro
AUNE Jasper	qkhhnohhvm
Aure Audio Elixir	pkhipkgmtp
Aure Audio Elixir (foam eartips)	plhipiiknm
Aure Audio Flame	pkghokhrtm
Aure Audio Flame (foam eartips)	qlhjqginkl
Aure Audio Storm	nkgkkmhoog
Aurex HR V9	wkjjkhnjsi
Auribus Acoustics Everest	tijklhirok
Auribus Acoustics Sierra Open	lllklhkkqk
Aurisonics Kicker	flfempfvqt
Aurisonics Rockets	rkhfjkkwvp
Aurorus Australis	xkhjlhmktr
Aurorus Borealis	wgijmeolrr
Austrian Audio Hi-X15	gm9qqgrafk
Austrian Audio Hi-X20	8pbpmnpail
Austrian Audio Hi-X55	qp9ht8tqjl
Austrian Audio Hi-X60	fsgingqjjk
Austrian Audio Hi-X65	tkigflughk
Austrian Audio The Composer	nmhflpoekk
Austrian Audio The Composer (minimal setting)	qlihjkqgol
Austrian Audio The Composer (standard setting)	qlihjkqgol
Avantone Planar	vkijjfnprm
Avantree HT5009	midfAekkak
AVIOT TE-D01b	ekfdlqiuno
AVIOT TE-D01d	dkgfmqhunn
Aya Siren	uligjofpsk
Aya Trident	hpmejoioql
AZLA 01R Mk2	ljghnqifpt
AZLA Azel	amhfopjljn
AZLA Horizon	fmgfnpkljp
AZLA Orta	mkhhnodntr
Bamboo Forest Bird Jinghong	glhhrqefsr
Bang & Olufsen Beoplay E8	jlockjmw6c
Bang & Olufsen Beoplay E8 2.0	mjndjkns6d
Bang & Olufsen Beoplay Earset 3i	uokfkepoiq
Bang & Olufsen Beoplay Earset Wireless	udahmntd5d
Bang & Olufsen BeoPlay Ex	injgjmlnnn
Bang & Olufsen Beoplay H3	rieflnpimq
Bang & Olufsen Beoplay H6	kllmochspi
Bang & Olufsen Beoplay H6 (2nd Gen)	glgtjidvjd
Bang & Olufsen BeoPlay H7	mlfiuajwkh
Bang & Olufsen Beoplay H9	9mebqqllmh
Bang & Olufsen Beoplay H9 (Gen 1)	6piftqfgm8
Bang & Olufsen Beoplay H95	bjoclkomme
Bang & Olufsen Beoplay H9i	3vmjsbiruh
Bang & Olufsen Beoplay Portal	wilhqldjns
Bang & Olufsen E8 3.0	mjrcjjor2a
Baseus AeQur GH02 (active)	hgofmnhlhb
Baseus AeQur GH02 (passive)	skffmkmp9j
Baseus AirGo AS01	ulpstn0g00
Baseus Bowie (original EQ)	ejeemqpgrl
Baseus Bowie D05	unmjiigtj9
Baseus Bowie MA20 (ANC off)	fbeoknkjnp
Baseus Bowie MA20 (ANC on)	heeojokilp
Baseus M2s	ngijnnjdnu
BASN Bmaster	hlggnjiyoq
BASN Bmaster5	nkgfkplloi
BASN Metalen	theelpmlnl
BASN Mix-PD	pighoogmue
BASN MMCX	pgghnigxrp
BASN MTPro	qgddksivtc
Beats Beats Powerbeats 4	hmiknlfpli
Beats EP On-Ear	ojffomkpii
Beats Fit Pro	ijlmmjhiho
Beats Flex	ckiiohixle
Beats Mixr	mhedujmjtm
Beats Powerbeats 2 Wireless	ojgejjquid
Beats Powerbeats Pro	kljlmkfnro
Beats PowerBeats Pro 2	kjmmmigjns
Beats Powerbeats3 Wireless	dkhjqhhskn
Beats Pro	ogefosijpo
Beats Solo	pi9aufumxt
Beats Solo (sample 1)	gib8whukwt
Beats Solo (sample 2)	xi8bteunxt
Beats Solo 4	mjlmngndik
Beats Solo Buds	jinnqhdhns
Beats Solo HD	dnafsfslxt
Beats Solo Pro	gillminekg
Beats Solo2 (2014)	kjfclmskss
Beats Solo3 (2016, wired)	jjfcoopgvq
Beats Solo3 (2016, wireless)	kiecooqguq
Beats Solo3 (wireless, 2019)	kiebsqkkkl
Beats Solo3 Wireless (2018)	jiferqijgi
Beats Studio	qgheksiohm
Beats Studio 2 (2014)	pefkw7qjrf
Beats Studio 2 (Bluetooth)	ughku7rfqi
Beats Studio Buds +	iomqkicnqi
Beats Studio Pro	dsipnjemfg
Beats Studio Wireless	qfdltcmojc
Beats Studio3 Wireless	wbjdhnpppe
Beats Tour	bmggnqjjms
Beats Tour (2014)	hicclmqstp
Beats urBeats	djcalptonq
Beats urBeats3	9nhgppgmgg
Beats X	gjikohfxic
Behringer HC 200	zjmhi6swpj
Behringer HPS5000	vokjnbgxlh
Behringer SD251-BT	elefnpkjrs
Betron YSM1000	hjcakqukps
Beyerdynamic Amiron 100 (eq off)	jhilglqkdm
Beyerdynamic Amiron 300 (eq off, ANC Max)	nhhlijlojm
Beyerdynamic Amiron Home	pjedjoslgk
Beyerdynamic Amiron Wireless	ujghhnmpbe
Beyerdynamic Amiron Wireless (Bluetooth)	kmahmjrnkp
Beyerdynamic Amiron Wireless (wired)	ll9hmjsmin
Beyerdynamic Aventho Wireless	kfejkessfl
Beyerdynamic Blue Byrd	unhfhoqhhr
Beyerdynamic Custom One Pro (step 1)	wredloirto
Beyerdynamic Custom One Pro (step 2)	mnsaklhtup
Beyerdynamic Custom One Pro (step 3)	njlfjlhtvq
Beyerdynamic Custom One Pro (step 4)	oihgmkiuvr
Beyerdynamic Custom One Pro Plus (step 3)	nkemknimpl
Beyerdynamic DJX-1	wijhkhmqqj
Beyerdynamic DT 100 (2x 2k Ohm)	wkg8kqkurm
Beyerdynamic DT 1350	njijbiAfil
Beyerdynamic DT 150 (250 Ohm)	rmajplljnh
Beyerdynamic DT 1770 (leatherette earpads)	im5plklujn
Beyerdynamic DT 1770 (velour earpads)	jmapijnrgl
Beyerdynamic DT 1770 Pro (velour earpads)	jnbqhhnqik
Beyerdynamic DT 177X Go (leather earpads)	ik9kmgspnm
Beyerdynamic DT 177X Go (velour earpads)	hn7jlhurip
Beyerdynamic DT 1990 (analytic earpads)	ujigkmjrdc
Beyerdynamic DT 1990 (balanced earpads)	pjgelnmpgf
Beyerdynamic DT 1990 Pro (analytical earpads)	ujiglkkqgd
Beyerdynamic DT 1990 Pro (Dekoni Elite velour earpads)	pjfdlmoqed
Beyerdynamic DT 1990 Pro MKII	tkhimkmkfj
Beyerdynamic DT 231	tmnlkclmcc
Beyerdynamic DT 235	vifkkimnff
Beyerdynamic DT 240	mjdholitsn
Beyerdynamic DT 240 Pro	nhfhnljqvo
Beyerdynamic DT 250 (250 Ohm)	lplljiiple
Beyerdynamic DT 250 (80 Ohm)	vgnliifquo
Beyerdynamic DT 48	zacjwk7vp7
Beyerdynamic DT 48 (loose)	vom9vm9tr9
Beyerdynamic DT 48 E (120 Ohm)	zbciwj9wo6
Beyerdynamic DT 48 E (earpad holes covered)	yeciyh9up7
Beyerdynamic DT 48 S (5 Ohm)	zmrCf5bpte
Beyerdynamic DT 700 Pro X	lncrkiipho
Beyerdynamic DT 770 (Alpha earpads)	ihfqjijroh
Beyerdynamic DT 770 M	xr6ilniwqm
Beyerdynamic DT 770 Pro	dlinjjkpch
Beyerdynamic DT 770 Pro (250 Ohm)	bogokhmp9g
Beyerdynamic DT 770 Pro (32 ohm Limited Edition, pleather earpads)	knaikopnig
Beyerdynamic DT 770 Pro (32 Ohm)	ikcokkmn79
Beyerdynamic DT 770 Pro (600 Ohm)	klflimlp6b
Beyerdynamic DT 770 Pro (80 Ohm)	jdjpijjndj
Beyerdynamic DT 770 Pro (Dekoni hybrid earpads)	ihmtfhimed
Beyerdynamic DT 770 Pro (worn earpads)	jrinhkjpde
Beyerdynamic DT 860	umjiljjmci
Beyerdynamic DT 880	ujggkmmmgj
Beyerdynamic DT 880 (250 Ohm)	umihkjqied
Beyerdynamic DT 880 (32 Ohm)	vjggjmnnhn
Beyerdynamic DT 880 (600 Ohm)	ulhhklokgh
Beyerdynamic DT 880 (worn earpads)	unkikjinjj
Beyerdynamic DT 880 2003 Edition	uliiminhih
Beyerdynamic DT 880 Black Edition	uigeknqjfj
Beyerdynamic DT 880 Edition (600 Ohm)	ukhglmllee
Beyerdynamic DT 900 Pro X	skihjllngn
Beyerdynamic DT 990 (600 Ohm)	ulddnlrkbb
Beyerdynamic DT 990 (fresh earpads)	tgfipkljcb
Beyerdynamic DT 990 (worn earpads)	shehmllpga
Beyerdynamic DT 990 Pro	tgfhpkljcb
Beyerdynamic DT 990 Pro (250 Ohm)	tgfioilohf
Beyerdynamic DT 990 Pro Black Edition	tnjhohmia6
Beyerdynamic DT1990 (Dekoni Elite velour earpads)	rjgelmmphf
Beyerdynamic DT770 Pro X Limited Edition	bnbtkiko8i
Beyerdynamic DTX 300p	woiigdqsot
Beyerdynamic DTX 350m	sjdsjhlikh
Beyerdynamic DTX 350p	hjdqoelljd
Beyerdynamic ET1000	wpfknkgmsg
Beyerdynamic Lagoon	lkcjtejubk
Beyerdynamic MMX 300	sjflkljnif
Beyerdynamic MMX 300 (2nd Generation)	jncphllo7d
Beyerdynamic MMX 300 (Dekoni Choice leather earpads)	nicojjlrge
Beyerdynamic MMX100	dkbsikmngn
Beyerdynamic MMX150	ejarillofo
Beyerdynamic T1	ukhhklnkde
Beyerdynamic T1 (2nd Gen)	uigfjkppeg
Beyerdynamic T1 (3rd Gen)	midbfnwsir
Beyerdynamic T1 (sample 1)	ulhhklnmbc
Beyerdynamic T1 (serial number 3964)	ujhhkmnigh
Beyerdynamic T5 (3rd Gen)	km4kqcurks
Beyerdynamic T50p	yemeegqxrk
Beyerdynamic T50p (sample A)	zflfghousk
Beyerdynamic T50p (sample B)	xdmeeduxsn
Beyerdynamic T50p (serial number 16912)	yepddhoyqh
Beyerdynamic T51i	peahiltpqk
Beyerdynamic T5p	tm6lplkllo
Beyerdynamic T5p (sample 1)	lqejqijnjn
Beyerdynamic T5p (serial number 2866)	rmfhpkgrih
Beyerdynamic T70	slgjlimodg
Beyerdynamic T70 (sample 1)	umhijioofg
Beyerdynamic T70 (serial number 01111)	uiihkhnsig
Beyerdynamic T70p	qjhikgpqge
Beyerdynamic T90	tmiglplic8
Beyerdynamic TYGR 300	shgfnmmkhi
Beyerdynamic TYGR 300 R	rhgfnlnlfg
Beyerdynamic Xelento	gkednnnols
Beyerdynamic Xelento (2nd Gen)	fkedljsshq
Beyerdynamic Xelento Wireless	fkggmmnlip
BGVP DM6	tifdkjrqcl
BGVP DM7	tjggmllmot
BGVP DM8	wgcfnoismf
BGVP DM9	nkgfnmishf
BGVP DMA	jjehnklrfh
BGVP DMG	kiddlrplck
BGVP DMG (black)	ijddlsmmkn
BGVP DMG (foam eartips)	midelrnlbh
BGVP DMG (gold)	ijdckqppio
BGVP DMG (silver)	kjeelsmljo
BGVP DMS	mjffoniout
BGVP DN3	righnrdkun
BGVP DS1 Pro	ljffophmnu
BGVP ES12 (off-off-off)	ukhhkljprm
BGVP ES12 (off-off-on)	umjjohjkgm
BGVP ES12 (off-on-off)	ojecjnpswq
BGVP ES12 (on-off-off)	tkhglmippm
BGVP ES12 (on-on-on)	ojednmoolq
BGVP Melody (balanced nozzle)	kkeempoeps
BGVP Melody (hifi nozzle)	kkeempqcnr
BGVP Melody (pop nozzle)	qkgflpmfqs
BGVP NS10 PRO (red filter)	oljkpifmge
BGVP NS10 PRO (short filter)	nmjkqifmfe
BGVP NS10 PRO (silver filter)	oljlqiflff
BGVP NS9 (black eartips)	dkeeoiotlf
BGVP NS9 (gray filter)	ekeeojpqkk
BGVP NS9 (no mesh, black eartips)	dkeeojoule
BGVP NS9 (red filter)	ekeeoiprkj
BGVP NS9 (silver filter)	ekeeoiprjj
BGVP P05 (no filter, standard nozzle)	jmiilllkom
BGVP P05 (red filter, alternative nozzle)	skhhkmklrr
BGVP P05 (red filter, standard nozzle)	skhhlmkkpk
BGVP P05 (silver filter, alternative nozzle)	kmiilljlqn
BGVP P05 (silver filter, standard nozzle)	kmiilmkkol
BGVP P05 (taped filter, standard nozzle)	pkhhlmlkon
BGVP Phantom	jkfhoimnhj
BGVP Phantom SE Snake Edition	plilohkjgj
BGVP Scale	rieemqhrmi
BGVP SGZ-DN1S	hkdcloqogh
BGVP Solomon	injjnhojhk
BGVP VG4 (off-off-off)	ukhglmhrkm
BGVP VG4 (off-off-on)	qkgeknjuop
BGVP VG4 (off-on-off)	uliglmgrln
BGVP VG4 (on-off-off)	ukiglmhqjn
BGVP ZERO	xfbchpwjzq
Big Bus Earbuds	Antm09Estw
Binary Acoustics Dynaquattro	iliimljlqc
Binary Acoustics x Gizaudio Chopin	khimklhlok
BKHC BK9	qgjhcfyrxt
Bloc Roc Galvanize S2	s9ffnojnpv
BLON Annotation	amhfqmfqep
BLON B-Mini	hlefmplphl
BLON B20	rljjljmguj
BLON B60	phbwikhloh
BLON BL-01	kkffnolmmj
BLON BL-03	flffnnirml
BLON BL-05	lliinncqqm
BLON BL-A8 Prometheus	pheemqhsip
BLON BL-Max	kkfgnpdsqo
BLON BL07	fkdclpordh
BLON Fat Girl	hlfgonkmgn
BLON x HBB Z300	hlggmlksmh
BLON x Z Jojo	jkffmmlpog
BLON Z200	elffnpgvfn
Blue Lola	mjfhphmlvs
Blue MOFI (active)	qiggqgnkxs
Blue MOFI (passive)	ojggqgmmxs
BlueAnt Embrace	xjdcueltgt
Bluedio R2-WH	pegcmpkqzu
Bluedio T2S	bid7kxkvoo
Bluedio T3 Plus	bk49BAdfti
Bluedio T4 Turbine	ctqotccggq
Bluedio U Plus	ei5kDldhqn
BlueParrott B450-XT	lfennhiukk
Boltune BT-BH024	9iihnmhstj
Boqari Q1	xnkgehrnru
Bose AE2	dmjhqesflp
Bose Hearphones	gohflqimjq
Bose IE2	ejd9eoxwxv
Bose Noise Cancelling Headphones 700	nhghlmmjup
Bose Q25 (ANC off)	wrafp9zjot
Bose QuietComfort	aogioknjhm
Bose QuietComfort 15	mihgolmhjo
Bose QuietComfort 20	pkiiktckrs
Bose QuietComfort 20 (passive)	yhedqjnlss
Bose QuietComfort 25	phjiojjmkn
Bose QuietComfort 25 (passive)	nabgoezkut
Bose QuietComfort 3	ilffmfwjxj
Bose QuietComfort 35	kkjimrdlhj
Bose QuietComfort 35 (wired, active)	mjjjmlmeol
Bose QuietComfort 35 (wired, passive)	tgbkmeAcrk
Bose QuietComfort 35 (wireless)	hmjimkpdni
Bose QuietComfort 35 II	ikjimohlik
Bose QuietComfort 35 II (passive)	sm1nqczepr
Bose QuietComfort 45	ijhjmnkijj
Bose QuietComfort 45 (ANC on)	nihinqbpki
Bose QuietComfort 45 (passive)	vm5msasnoq
Bose QuietComfort Earbuds	mlknjmemke
Bose QuietComfort EarBuds 2024	cvkpkjghoh
Bose QuietComfort Earbuds II	bnljmoidio
Bose QuietComfort II (100dB)	jolmipfgqj
Bose QuietComfort II (80dB)	6nmnkqeenj
Bose QuietComfort II (90dB)	dommjpfgpj
Bose QuietComfort SE (ANC on)	ilhimnlglk
Bose QuietComfort SE (passive)	rq0ppcAfnp
Bose QuietComfort Ultra (ANC on)	8ihknmiooi
Bose QuietComfort Ultra Earbuds	akkjkuckkp
Bose QuietComfort Ultra Headphones	fiknhmjmlm
Bose QuietControl 30	jmihpljiln
Bose SoundLink Around-Ear II	kmkjmngjoi
Bose SoundLink On-Ear	gkhfmonkjb
Bose SoundSport Free	thhjlkjpno
Bose SoundSport In-Ear	uoiiiljqik
Bose SoundSport Wireless	ejgelnonpk
Bose SoundTrue Around-Ear II	moihtghmlo
Bose SoundTrue Ultra In-Ear	mmigpjklfl
Bose Sport Earbuds	whimln9smf
Bose Sport Open Earbuds	vpkfnilhsl
Bose Ultra Open Earbuds	tmpijkp6cq
Bowers & Wilkins C5	6ngfnoqfqo
Bowers & Wilkins C5 Series 2	7lecmptipq
Bowers & Wilkins P3	ueebfqvmsp
Bowers & Wilkins P5	thilqfdrht
Bowers & Wilkins P5 Series 2	jiflukaons
Bowers & Wilkins P5 Wireless	hkifthimmq
Bowers & Wilkins P7	jkfloiiqoj
Bowers & Wilkins P7 Wireless (wired)	thikojglnn
Bowers & Wilkins P7 Wireless (wireless)	sghhokkkpo
Bowers & Wilkins Pi7	dmgdnpmnq7
Bowers & Wilkins Pi7 S2	emgdpomlpa
Bowers & Wilkins Pi7 S2 (ANC Off)	cnffpphoub
Bowers & Wilkins Pi7 S2 (ANC On)	gmgelonltb
Bowers & Wilkins Pi8	pigfjrjpnb
Bowers & Wilkins PX	ojhakrmnpm
Bowers & Wilkins PX5	ofceluircl
Bowers & Wilkins PX7	ej9llohydb
Bowers & Wilkins Px7 S2	enagqkqlki
Bowers & Wilkins Px7 S2e	amgfohsknl
Bowers & Wilkins Px7 S2e (ANC off)	gjhfnitjlk
Bowers & Wilkins Px7 S2e (ANC on)	amhfohtjlk
Bowers & Wilkins PX7 S3 (ANC off, position1)	dk6hpksnke
Bowers & Wilkins PX7 S3 (ANC on, position 1)	di9hnksnkf
Bowers & Wilkins PX7 S3 (ANC on, position 2)	ci9hoknvnd
Bowers & Wilkins PX7 S3 (ANC on, position 3)	eiainnqjje
Bowers & Wilkins PX7 S3 (ANC on, position 4)	ci9hokmvod
Bowers & Wilkins Px8	flcgohslol
BQEYZ Autumn (bass filter)	nkggnoiktq
BQEYZ Autumn (no filter)	vlpze9jfbj
BQEYZ Autumn (normal filter)	sjggmniksp
BQEYZ Autumn (treble filter)	vkihlnijrp
BQEYZ Cloud	lkijnngmhg
BQEYZ Frost	ujgglmitpj
BQEYZ K1	kjffnpknrj
BQEYZ KB100	sjggmpfqqj
BQEYZ Spring 1	okfekpjvkh
BQEYZ Spring 1 (mesh mod)	qkgfksesoo
BQEYZ Spring 2	qlgflpgtik
BQEYZ Summer	pkgfmqeslm
BQEYZ Topaz	plggmoevpn
BQEYZ Wind	mkhhmngokk
BQEYZ Winter	rkghmlhrmm
Brainwavz B400	wiedjmpovp
Brainwavz HM5	ulelqikfkm
Brainwavz Koel	vohfilnrjl
Brainwavz M2	xjgglglwpo
Brainwavz M5	slplilo4bl
Brainwavz R3	ukgfijlxtm
Brainwavz S0	ijdcjqtirs
Brainwavz S1	gkddkqudnj
Brainwavz S5	ejdcloxfej
Caeden Linea No 10 (wired, active)	jgcgqhmull
Caeden Linea No 10 (wired, passive)	kgegogouno
California Headphone Company Lorado	zeegojhxnh
California Headphone Company Silverado	doaclqmwgj
Cambridge Audio Melomania 1	nlgeloiwna
Cambridge Audio Melomania M100 (foam eartips)	kkhkkkofqg
Cambridge Audio Melomania M100 (silicone eartips)	klhkkjpgoi
Cambridge Audio Melomania P100 (ANC off)	0ognmipjll
Cambridge Audio Melomania P100 (ANC on)	3pkllhpikm
Campfire Audio Alien Brain	mjhinhhwpi
Campfire Audio Andromeda	rjgejkosmo
Campfire Audio Andromeda (pre-2020)	qjfdimownm
Campfire Audio Andromeda 2020	qjfeinkwoj
Campfire Audio Andromeda Gold	pifelohwlk
Campfire Audio Andromeda SS	uifehlnwpn
Campfire Audio Ara	ukhfljkukm
Campfire Audio Astrolith	liddmnmvea
Campfire Audio Atlas	ekdcmoppip
Campfire Audio Axion v2	nidcllpvmd
Campfire Audio Bonneville	lideninyfa
Campfire Audio Cascade	khaesmmmhq
Campfire Audio Comet	tkhgilopno
Campfire Audio Dorado	ikdclkpxqr
Campfire Audio Dorado 2020	hjdbnmpukl
Campfire Audio Equinox	hjcbjtnrol
Campfire Audio Holocene	skgeihqxne
Campfire Audio Honeydew	ckdckjusls
Campfire Audio IO	sjgemijAmh
Campfire Audio Mammoth	lkecnpjrnu
Campfire Audio Moon Rover	sjgflnfyka
Campfire Audio Onyx	bkb9iurtqo
Campfire Audio Orbit	kkebgmxser
Campfire Audio Orion	slhfjmjtpu
Campfire Audio Pathfinder	ilgfllkshf
Campfire Audio Polaris	gmhhpmfqhq
Campfire Audio Polaris (V1)	gmhhpmfqhq
Campfire Audio Polaris V2	ckdcmrmtjs
Campfire Audio Satsuma	qkgejnqkjt
Campfire Audio Solaris (pre-2020)	plhgkmgxpi
Campfire Audio Solaris 2020	olhfknfzmi
Campfire Audio Solaris SE	qlhgklfzqj
Campfire Audio Solstice	okfcjlpvoq
Campfire Audio Supermoon	fmiiolduig
Campfire Audio Trifecta	dmeennithp
Campfire Audio Vega (foam eartips)	fkddmloxbm
Campfire Audio Vega (pre-2020)	fkddmkoyhs
Campfire Audio Vega 2020	ekdcmolvmu
Canal Works CW-U77	qkggjjmuku
Canal Works CW-U91	thechlvnkr
Canpur CP622B	gokjijlpod
Canpur JF1	mkfgoqcrvg
Cardas A8	jmihldqqpt
Cardas EM5813	lkedhqrkzt
CAT Apollo	ijgepnipin
Cat Ear Audio Meow	ujhinqdhAr
Cat Ear Audio Mia	ilgfnpeqvs
Cayin Fantasy	tjghnpiggk
Cayin YB04	vkihmjgsjj
CCA A10	ukiktidgkr
CCA C10	mkfgnqenno
CCA C12	mjfgppfmni
CCA C16	okghsmarlr
CCA CA10	dlegslhmjv
CCA CRA	fmhhnmjmkg
CCA CRA PRO	hmiinmimhg
CCA CSN	mjggnnfujp
CCA CST	mkfgnqjjgk
CCA CXS	gliinnhmlm
CCA DUO	oljjmkinjb
CCA FLA	fkggoojlsj
CCA Hydro (off-off-off-off)	lhbjrmjkke
CCA Hydro (off-off-on-on)	pheopjhihc
CCA Hydro (on-on-off-off)	ofchqmjmne
CCA Hydro (on-on-on-on)	jjfrojhihc
CCA NRA	sifdomhtln
CCA Pianist	jnklpjfjfd
CCA PLA13	dlggnqfqsb
CCA Polaris (off-off-off-off)	olhhmlkmlg
CCA Polaris (off-off-on-off)	jnjhmlkmlf
CCA Polaris (off-on-off-off)	lnihllkmlf
CCA Polaris (on-off-off-off)	mmihmlkmlf
CCA Polaris (on-on-on-on)	lkiimljorl
CCA Rhapsody (off-off-off-off)	ofbhsnhoqg
CCA Rhapsody (off-off-off-on)	sfempkgmnf
CCA Rhapsody (off-off-on-off)	niejpljklf
CCA Rhapsody (off-off-on-on)	sfempkglme
CCA Rhapsody (off-on-on-off)	hkgkoljjkf
CCA Rhapsody (off-on-on-on)	lhfookgkle
CCA Rhapsody (on-off-off-off)	jjehqmjklf
CCA Rhapsody (on-off-on-off)	ljfjpljkkf
CCA Rhapsody (on-on-off-off)	fjeiqmjklf
CCA Rhapsody (on-on-on-off)	hkgkoljjkf
CCA Rhapsody (on-on-on-on)	mhfookfkmd
CCA Trio	ohimllilig
CCA Trio (off-off-off-off)	lhejnnljji
CCA Trio (off-off-on-on)	phhlllkihh
CCA Trio (off-on-on-off)	njilllkhih
CCA Trio (off-on-on-on)	kjjmklkhhg
CCA Trio (on-off-off-off)	jifinmljji
CCA Trio (on-off-off-on)	phhlllkihg
CCA Trio (on-on-off-off)	gjfjnmljjh
CCA Trio (on-on-on-off)	ijhklmliih
CCA Trio (on-on-on-on)	kjjmklkihg
CCZ Emerald	rfdenpmipo
CCZ Melody	jjeeoqjltl
CCZ Plume	jiddmpmpjm
CCZ SOLO	gkeeoqlhpm
CCZ Warrior	oieelnktrk
CHIKYU-SEKAI 16 Cosmos	tiggkohrxl
CKLVX 1DD+4BA	mkijmiirqc
Clariar i430	rkhimmhnpf
Clariar i640	injinneoqi
Clear Tune CT-200	uolhklills
Clear Tune CT-300P	nkeceqvmmt
Clear Tune CT-6E	tlhgix9ows
Clear Tune CT500-E	slhfkvdlvs
Cleer Next	rkhfmpjhrp
CMF by Nothing Buds 2 Plus (ANC off, pop)	ejmjgoling
CMF by Nothing Buds 2 Plus (ANC on, pop)	ejmjholing
CMF by Nothing Buds Pro (ANC on, balanced EQ)	femlljjmgn
CMF by Nothing Buds Pro 2	6gfenloudn
CMF by Nothing by Nothin Buds Pro (ANC off)	jcmmljjjhl
Co-Donguri Brass	jkfforkbqm
Co-Donguri Shizuku	kkffntjcpl
Colorfly Quintet	skjjolcoom
Colorfly Silver Reference	kkggllommn
Comradz NW-STUDIO	ulptot0d1i
Comradz NW-STUDIO PRO	whjiqp4qmu
Cooler Master MH630	tf9plshfa9
Cooler Master MH751	ugekmkhsjf
Cooler Master MH752	lobmnjhrqf
Corsair HS35	khafmsscgi
Corsair HS50	nhbkoioncf
Corsair HS60	mhalnjnled
Corsair HS60 HAPTIC	nfdeloppgh
Corsair HS60 PRO SURROUND	jg9bootlhj
Corsair HS70 Bluetooth	qc8jppmk9f
Corsair HS70 Pro	ncbkiuiodm
Corsair HS70 Wireless	ofdlkolmea
Corsair HS75 XB WIRELESS	q8aglqmsln
Corsair HS80 MAX WIRELESS	uhfcogowjp
Corsair HS80 RGB WIRELESS	whecnhpulr
Corsair VIRTUOSO PRO	uf9klnmojl
Corsair Virtuoso RGB Wireless SE	sjcdyfkolm
Corsair VIRTUOSO RGB Wireless XT	wlefvieoqn
Corsair Void Elite	whc9smnngt
Corsair Void PRO RGB	v8ejraqret
Cosmic Ears CE6B	kkfelknuqq
Cougar Immersa	ve8cmqsmki
Cowin Apex Elite	vhcajnuq5k
Cowin E7	mnhdgeztkl
Cowin E7 (wired, ANC off)	wi67qmvqdj
Cowin E7 Pro	v9hkwcdv7b
Cowin E8	ueahlexpbt
Cowin SE7	ynfciipwrn
Cozoy Hera C103	gojglijulu
Cozoy Trio	rjfcpohris
Craft Ears Argentum	hlggoljnud
Craft Ears Aurum	fqmjkikoub
Craft Ears Craft SIX	mmkklkhpnf
Craft Ears Craft SIX (CIEM)	lmjjlkgpue
Craft Ears Craft TWO	okfeklmqts
Craft Ears Cuprum	pkgfmmlnse
Craft Ears Omnium	gpnglpeoo8
Creative Aurvana	rgghnipjrh
Creative Aurvana Ace	gnhfkmomlm
Creative Aurvana Ace 2	hmicooniii
Creative Aurvana Ace 2 (Ambient mode on)	hojfklonhg
Creative Aurvana Ace 2 (ANC Off)	hojfklonhg
Creative Aurvana Ace 2 (ANC On)	hmhfkmpnhg
Creative Aurvana Gold	flhchlurjt
Creative Aurvana In Ear 3	vmgfjknplu
Creative Aurvana Mimi (ANC off)	boifmllrl9
Creative Aurvana Mimi (ANC on)	fnielnnnna
Creative Aurvana Trio	ljedkqmpmn
Creative Aurvana Trio LS	fjdclqskjo
Creative Fatal1ty	medfpertul
Creative Labs Aurvana Ace 2 (ANC off, flat eq)	jnjfjloljn
Creative Labs Aurvana Ace 2 (ANC on, flat eq)	eohfjmqkkm
Creative Outlier Air	kieenoongh
Creative Outlier Air V2	hlfeonqhag
Creative Outlier Free Pro Plus	wkvikjefes
Creative Outlier Pro	oiifiqofAp
Creative Sensemore Air	vkccjposia
Creative Sound Blaster EVO ZxR	vcc7jrtsgj
Creative Sound BlasterX H5	vndehvmigk
Creative Sound Blasterx H6 (analog input)	rjfetbxckl
Creative SXFI Air	vlghndxdfi
Creative Zen Air	emgflomnpt
Creative Zen Air DOT	ulqqsd7icm
Creative Zen Hybrid (ANC off)	moifordklm
Creative Zen Hybrid (ANC on)	mqboppchjm
Creative Zen Hybrid (passive)	ljdkjcsvlm
Creative Zen Hybrid Pro (ANC off)	nfdhpofskl
Creative Zen Hybrid Pro (ANC on)	nkeinkhvjm
Creative Zen Hybrid Pro SXFI	ldggpr9wil
CrinEar Daybreak	gmkhjnlnqe
CrinEar Meta	ljliiljqsb
Custom Art Ei.3	qjffikqqot
Custom Art FIBAE 1	tlihkpihws
Custom Art FIBAE 2	rkgfloexrp
Custom Art FIBAE 3	qlgfiqnjyg
Custom Art FIBAE 4	piediqnruo
Custom Art Fibae 5	jmigkllqf8
Custom Art FIBAE 7	rkhhmofnyo
Custom Art FIBAE 7 Unlimited	nkgfklnpog
Custom Art FIBAE Black	rjgdipjvus
Custom Art FIBAE ME	ljdbkriwwm
Custom Art Harmony 8.2	uifglqayuq
Custom Art Pro330v2	tjgefppovs
CVJ Aria	wheflnksmj
CVJ Aria 2025 (blue nozzle)	uhefknmqjk
CVJ Aria 2025 (gold nozzle)	viffkolpkk
CVJ Aria 2025 (silver nozzle)	viffknkpjk
CVJ Assassin (off-off)	kmiimhiuvp
CVJ Assassin (off-on)	kmiimhivqj
CVJ Assassin (on-off)	kmihmhiuvq
CVJ Assassin (on-on)	kmihmhivqj
CVJ Konoka (off-off)	kmjjonbonq
CVJ Konoka (off-on)	mt0tqocqor
CVJ Konoka (on-off)	kmjjonbpgk
CVJ Konoka (on-on)	lu1soocqhl
CVJ Mei (off-off)	jkggngluxt
CVJ Mei (off-on)	jkghngnsim
CVJ Mei (on-off)	jkggnglvvi
CVJ Mei (on-on)	jkggngnsih
CVJ Mermaid II	okhimmjlke
CVJ Shadowblade	rhcemompsh
CVJ ShadowBlade (black nozzle)	ohadlnrprg
CVJ ShadowBlade (gold nozzle)	ticfmpjmtj
CVJ ShadowBlade (silver nozzle)	vgdeknnoqh
CVJ TXS (off-off)	lkghnnimrq
CVJ TXS (off-on)	lkghnnhlpo
CVJ TXS (on-on)	lkghnnimrq
CVJ Yakumi	rjghmmnelm
Cyberdrive Forte Classic Bass	akcclnvmbl
Cyberdrive Forte Classic Soprano	7mgfnov7cl
Cyberdrive Forte Impact Bass	bkedkmvoal
Cypher Labs Astru IEM	wkhgkokjoq
Cypher Labs Astru IEM (bass boost filter)	tlhgkokkpr
Cypherus Audio Campfred	yhfklifwsu
Daiso  2 earphones	vliia9Cusw
Dali IO-4	xgdekmqpsg
Dali IO-6	jhejjlqlrm
Dan Clark Audio Aeon 2 Closed	mjfjjioslj
Dan Clark Audio Aeon 2 Closed (perforated earpads)	pgenjnjkjg
Dan Clark Audio Aeon 2 Noire	ljfkkionlj
Dan Clark Audio Aeon 2 Open	nkcemnophi
Dan Clark Audio Aeon Closed RT	mglgkfrmlk
Dan Clark Audio Aeon Flow Closed	llkiigqojk
Dan Clark Audio Aeon Flow Closed (black filter)	rmkhgipqll
Dan Clark Audio Aeon Flow Closed (filters)	nkmijhplhi
Dan Clark Audio Aeon Flow Closed (white filter with one notch)	qmjhhioqnm
Dan Clark Audio Aeon Flow Open	picdkjssoo
Dan Clark Audio Aeon Flow Open (white filter with one notch)	sjdfjmoppm
Dan Clark Audio Aeon Open	oibdkjsslm
Dan Clark Audio Aeon X Closed	mjhjikqilh
Dan Clark Audio Aeon X Open	shcfmmpnki
Dan Clark Audio Alpha Dog (2014)	mmlcikqnou
Dan Clark Audio Alpha Prime	mijgjftohq
Dan Clark Audio E3	jkkljmkikj
Dan Clark Audio Ether 2	skhfmhmspq
Dan Clark Audio Ether C	tnoikjleol
Dan Clark Audio Ether C (1 black filter)	qlmimhnhro
Dan Clark Audio Ether C (2 black filters)	qllhlhmjsr
Dan Clark Audio Ether C Flow	pjjhlfkwmm
Dan Clark Audio Ether C Flow 1.1	knjjifslkk
Dan Clark Audio Ether CX	snkjkgkomp
Dan Clark Audio Ether Flow	ugeeolkufm
Dan Clark Audio Ether Flow 1.1	qlddkmtlin
Dan Clark Audio EXPANSE	jmflmkmhpm
Dan Clark Audio Mad Dog	wmckjerrkk
Dan Clark Audio Mad Dog (2014)	rjgcmgrsjs
Dan Clark Audio Noire X	jlikmljknh
Dan Clark Audio Stealth	hmjllilknm
Dan Clark Audio Voce	xkjjm7tlrr
Dark Project HS4 Wireless (breathable earpads, passive)	oghmqditdh
Dark Project HS4 Wireless (breathable earpads, wireless)	ohers2ou48
Dark Project HS4 Wireless (leather earpads, passive)	ngfgsekvgk
Dark Project HS4 Wireless (leather earpads, wireless)	miamv3qw6a
Dark Project Sono	fjbbAgivml
DCMEKA IE68	dlefopmile
ddHiFi E2020A Janus	umpjghirir
ddHiFi Janus3	fojimllhoi
ddHiFi Surface	kkfjoljktn
Debauche Bacchus Monroe	ikfempiskk
Defunc Mondo Freestyle	zjajxu0tyj
Delta Air complimentary earphones	Bnxk0gEozv
Denon AH-C260R	7leemprhko
Denon AH-C351K	plfdgkuuel
Denon AH-C360	hjdckowgjr
Denon AH-C452K	bmhgnpnedp
Denon AH-C551	liefotldip
Denon AH-C551K	gkeeouldgq
Denon AH-C560R	middkptfio
Denon AH-C710	ckeemqrfhr
Denon AH-C751K	ikggorlcen
Denon AH-D1001	vkgjpcsfkg
Denon AH-D1001K Silver	vjgkpcteni
Denon AH-D1100	kca7wmpqnk
Denon AH-D2000	uklmjeojhf
Denon AH-D2000 (2012)	pjigjjqllf
Denon AH-D2000 (JMoney earpads)	tjjlkgqcih
Denon AH-D310R	tggbpdsrkn
Denon AH-D400	wghctgkoys
Denon AH-D5000	ijgfninogl
Denon AH-D5000 (JMoney earpads)	sikiojncfe
Denon AH-D5200	oiggniqkln
Denon AH-D600	jlbnmlhqpg
Denon AH-D7000	teinlcrhff
Denon AH-D7000 (2012)	piigmkpilh
Denon AH-D7100	fn8ptggsme
Denon AH-D7200	njhjlbumkk
Denon AH-D9200	nkgfodvjki
Denon AH-NC732K	pjllo7mtjl
Denon AHGC20 Globe Cruiser	8ihiglxgot
Denon PerL Pro	flmighrpbc
Denon Perl Pro (ANC On, flat eq)	qiljdhrrfd
Dethonray Tender I	xljfjpcuyk
Devialet Gemini	bnkkjlmjig
Devialet Gemini II	aljikoofil
Diskin DH3	mikdsjfulp
Dita Audio Answer	pjgehkunkm
Dita Audio Brass	nkedknvhen
Dita Audio Dream	gpifklpjkj
Dita Audio Dream XLS	uojgigskko
Dita Audio Fealty	pjffjitoko
Dita Audio Fidelity	iniflmpekj
Dita Audio Mecha	lkijooekpg
Dita Audio Perpetua	wkhgjhmwnp
Dita Audio Prelude	lmjjnmfiod
Dita Audio Project 71	ilhfjlqlwq
Dita Audio Project M	klihljivla
Dita Audio Project M (foam eartips)	lmjiljitgg
Dita Audio Project M (silicone eartips)	mmjiljgwj8
Dita Audio Sakura 71	lmjglolcsn
Dita Audio Truth	nkgeikvlhl
DMS Project Omega	wgjjmgkmoi
Dolby Dimension	vghiimkqtc
DubsLabs Bedphones	znsdhalzvt
DUNU DaVinci	hlgiklnlph
DUNU DK2001	pkgelsfsmr
DUNU DK3001 BD	kknihjlpja
DUNU DK3001 Pro	qjhgllkqmt
DUNU DK4001	pkihmhiwju
DUNU DM380	cnhgnthhqg
DUNU DN1000	tkhfiloqhr
DUNU DN2000	mnifgitoon
DUNU DN2000J	rhfglmpl9l
DUNU DN2002	lkfeijsqrn
DUNU DN900	kojgihlxur
DUNU EST 112	rjhhlmgqnr
DUNU Falcon Pro (Atmospheric Immersion filter)	vifeipjsvq
DUNU Falcon Pro (Reference filter)	thediqnoro
DUNU Falcon Pro (Transparency filter)	vifeiqlmrq
DUNU Falcon Ultra	kjhhnkirtj
DUNU Falcon Ultra (blue nozzle)	mjginnjkml
DUNU Falcon Ultra (brass nozzle)	ojhinlhprl
DUNU Falcon Ultra (gold nozzle)	mjhinlhprm
DUNU Glacier	hjjklkjlki
DUNU Kima	qjiinmflup
DUNU Kima 2	vjhhmnhmpj
DUNU Kima Classic	hmiinnhimj
DUNU Luna	wjhgjnogwp
DUNU Mirai	jnkjjkhrre
DUNU SA3	uliglmfrts
DUNU SA6 (atmospheric Immersion mode)	klijmjiqql
DUNU SA6 (default mode)	mljkmihqpl
DUNU SA6 EST	mlijnghuni
DUNU SA6 MK2	hlghnhktug
DUNU SA6 MK2 (Atmospheric Immersion mode)	glggmhnurd
DUNU SA6 MK2 (default mode)	ilgimgntqc
DUNU SA6 Ultra (atmospheric immersion mode)	klhimijrqh
DUNU SA6 Ultra (default mode)	mlijmhjqph
DUNU Talos	qkkjmlbun8
DUNU Talos (BA off)	pmkjmmcrof
DUNU Talos (BA on)	pmkjmmauk9
DUNU Titan 1	ulifkpjihk
DUNU Titan 3	vnmijnhfrt
DUNU Titan 5	kkggnnklgp
DUNU Titan S	rkjjmnfjvg
DUNU Titan S2	qhghmmnjli
DUNU Vulkan	jnkhlkirql
DUNU Vulkan (gray eartips)	gnjgljnqni
DUNU Vulkan (red eartips)	gnigljmqlj
DUNU Vulkan 2	lnojjigrmj
DUNU x Gizaudio DaVinci	ligkkljorf
DUNU Zen	qjhjnocmtr
DUNU Zen Pro	thhimnepvp
Dynamic Motion DM200H	nifgnphkni
Dyson OnTrac	iijimmgris
Dyson OnTrac (ANC off, enhanced)	dlhkllknpn
Dyson OnTrac (ANC off, neutral)	kmhjklknqm
Dyson OnTrac (bass boost)	cgdimpkpsn
Dyson OnTrac (enhanced)	fijijojnqm
Dyson OnTrac (neutral)	nkjijnjoqm
Dyson Zone	iikjkmhrge
E-Mu Purpleheart	nhffmlqksj
E-Mu Teak	qfhjneqljm
E-Mu Teak (2016)	kiggmirlmj
E-Mu Teak (mahogany)	ljhfmjqlmh
E-Mu Teak (rosewood)	nigfmjpnmg
E-Mu Walnut	qifhngpori
EarAcoustic Audio SPA Hi-End Max	jkghnoiklo
EarFun Air 2 NC	fmniknjkjk
EarFun Air 2 NC (ANC off)	likklnhinn
EarFun Air 2 NC (ANC on)	ikmhknkgnr
EarFun Air Pro	fjglmmlhgh
EarFun Air Pro 2 (2021)	clikiomgfe
EarFun Air Pro 2 (A eartips)	cmkkllimji
EarFun Air Pro 2 (B eartips)	cljljllkjj
EarFun Air Pro 3	amfirmkhcp
EarFun Air Pro 3 (ANC noise cancelling, default EQ)	8nmoknehjj
EarFun Air Pro 3 (ANC normal, default EQ)	cllmmodjkj
EarFun Air Pro 4 (ANC off)	likklmenvg
EarFun Air Pro 4 (ANC on)	kikklmglpi
EarFun EH100 (black ring)	mkffnpnfih
EarFun EH100 (red ring)	elfenqofjh
EarFun Free	dlgfopinhe
EarFun Free Pro	eghimnlmhj
EarFun Free Pro (Oluv Edition, ANC off)	lpkgkljlxg
EarFun Free Pro (Oluv Edition, ANC on)	lokgkljlxg
EarFun Free Pro (Oluv Edition)	kqkglmikxf
EarFun Free Pro 3 (ANC off, default EQ)	jfgjhljykg
EarFun Wave	qgamsjgqmi
EarFun Wave Pro (ANC off)	akoipifmuo
EarFun Wave Pro (ANC on)	dplonnaiog
EarSonics Blade	jkfhoemvrq
EarSonics EM10	jlejobnwqq
EarSonics EM32	ejdnndnqqp
EarSonics EM4	mkgekmhxwp
EarSonics EM6	plhfklhwvo
EarSonics ES2	zmfejkiztt
EarSonics ES3	gkhlkentmp
EarSonics ES5	ikeitakwlq
EarSonics Grace	niejodmvpr
EarSonics Onyx	dlfhudjtkn
EarSonics Purple (standard)	vjhgnjgwri
EarSonics S-EM9	rhgik9swto
EarSonics Stark	ikeiodmwqo
EarSonics Velvet (standard)	hjftkclrjm
EarSonics Velvet (tight)	jijuhckqjl
EarSonics Velvet (warm)	fjcoodmsln
Eartech Dual	qjfdjmmxmq
Eartech Quad	sidchnqvlr
Eartech Triple	sjfdjlowjp
EarWerkz Legend Omega	sjfeklhztt
ECCI YST-02	rlijnnihmm
Echobox Finder X1 (black filter)	blggnoqcah
Echobox Finder X1 (red filter)	clggooqccg
Echobox Finder X1 (white filter)	bmggonqdeg
Edifier NeoBuds Pro	mehikjmrre
Edifier NeoBuds Pro 2	mdgknjjpj7
Edifier NeoBuds Pro 2 (ANC high, classic EQ)	gghkmikqmc
Edifier NeoBuds Pro 2 (ANC off, classic EQ)	fifinjlsnd
Edifier P180	umbmow5ndl
Edifier Stax Spirit S10 (original eq)	mlnhkikpk9
Edifier Stax Spirit S3 (fabric earpads)	vhglrgfmqe
Edifier Stax Spirit S3 (leather earpads)	vhkinkdpof
Edifier TWS1	gkelminnbn
Edifier TWS5	hkfljjmtci
Edifier TWS6	ikfjlimrms
Edifier W260NC	mijlglnkli
Edifier W820NB (ANC off)	ggclomjnmp
Edifier W820NB (ANC on)	picmmnhnkh
Edifier W820NB (passive)	ojelmngojl
Edifier W820NB Plus	ikinmjjjhi
Edifier W820NB Plus (ANC off)	h6hnokinki
Edifier W820NB Plus (ANC on)	lijpseghkh
Edifier WH700NB	gadnnoilef
Edifier WH950NB (ANC off, customized EQ flat)	highklonrm
Edifier WH950NB (ANC on, classic EQ)	mkjioingpo
Edifier WH950NB (ANC on, classic mode)	hmiemmqepq
Edifier WH950NB (ANC on, customized EQ flat)	kjignhomrn
Edifier WH950NB (ANC on, dynamic mode)	ckigmmqenn
Edifier WH950NB (passive)	lg7eimvtpp
Edifier X3 Lite	dhioklmfbf
Effect Audio Agea (foam eartips)	lljkmlglrd
Effect Audio Axiom	kjdcjrmsok
Effect Audio King Arthur	qiedijpxvq
Effect Audio Symphony	kjdagouvln
Effect Audio x Elysian Gaea	jlilmmhhme
Effect Audio X Elysian Pilgrim Noir	llkjlhjsqf
EKSA E900 Pro	kld4plrxqs
ELISE AUDIO x Kinera Dark Phoenix	mhfgslgnof
Elysian Annihilator (2021)	jkgjmnhnpc
Elysian Annihilator (2023, Dan)	dlfinmkmm8
Elysian Annihilator (2023, Free)	dlgjonhmo6
Elysian Annihilator (2023)	jjfimnippc
Elysian Annihilator (pre-2021)	njginofnma
Elysian Apostle	ljiknihqqe
Elysian Artemis	qiedionunu
Elysian Artemis V2	qjfemojrnj
Elysian Cora V2	ljhirmcosd
Elysian Diva (half bass)	dqnjmkgmqi
Elysian Diva (max bass)	8pmjmkgnqj
Elysian Diva (min bass)	pmkjmkhlqj
Elysian Diva 2023 (blue switch)	9oljnjhord
Elysian Diva 2023 (red switch)	rkjjmiinqc
Elysian Diva 2023 (white switch)	gpnjmignrc
Elysian Eros	qiecimowtt
Elysian Hades	sjfeimppmn
Elysian Hades V2	qkiimqekn9
Elysian Hades V2 (music)	nkghmqgkpa
Elysian Hades V2 (stage)	jjffnrimsc
Elysian Minerva	qiedlhpxoo
Elysian Pilgrim	hnlikkhqmh
Elysian Pilgrim (foam eartips)	hnlijkjnnh
Elysian Pilgrim Noir	gmkgjinrlj
Elysian Poseidon	nifgnngtld
Elysian Terminator	pjffkohvqm
Elysian Terminator V2	jkfgnqilqd
Elysian X	hnjinmglrd
Emotiva Airmotiv GR1	teigglqopj
Empire Ears Bravado	5ngeoqiopr
Empire Ears Bravado Mk2	9mgeopjonk
Empire Ears ESR	pjedjmmxhm
Empire Ears ESR Mk2	tjgflogsnm
Empire Ears EVR	ukhfjjjymp
Empire Ears EVR Mk2	wlihlhfAjj
Empire Ears Hero	gnjioleqdm
Empire Ears Legend EVO	elhfpqdnrk
Empire Ears Legend Raven	elefllmwij
Empire Ears Legend X	cmffnpfupj
Empire Ears Legend X SE	cmhgoqcrqh
Empire Ears Nemesis	amgfoofwee
Empire Ears Odin	lmjjokbqsk
Empire Ears Odyssey	dmfgnngvhk
Empire Ears Phantom	piecilruou
Empire Ears Phantom X	rifejnluts
Empire Ears Raven	emgfnmiugf
Empire Ears Triton	flhhnijtuq
Empire Ears Valkyrie	anihqpfiik
Empire Ears Valkyrie MKII	cnihqqegpm
Empire Ears Vantage	9mgfonippq
Empire Ears Wraith	wjhgmjewvt
Empire Ears Zeus	vjgflhkyfo
Empire Ears Zeus-XIV	vjhfmhiygj
Empire Ears Zeus-XR (R mode)	wkgfmiiyhq
Empire Ears Zeus-XR (XIV mode)	wkgfmiiyhq
ENACFIRE E60	jkffopftot
Endorfy Viro Infra	mgdishkrfj
ENIGMAcoustics Dharma Production 2015	uffjohlmfk
Enigmatic Audio Paradox	tkfcphqpto
EPOS GTW 270 Hybrid	jjfcnjoyda
EPOS Sennheiser Game Zero	hgtjeklmtl
EPOS Sennheiser GSP 600	qksjilhgkm
EPZ 320	tkgfjklwmp
EPZ 530	mlgfnpfqlc
EPZ G10	hojimliloj
EPZ G20	nlkjmkhkji
EPZ K5	njhipiljkn
EPZ K9	jlhhkmmkkh
EPZ P50	njkhklklqf
EPZ Q1	kmihkiluvj
EPZ Q1 Pro	knkjmliiki
EPZ Q5	kmjimllijb
EPZ Q5 Pro	lliimmkjlb
EPZ Q5 v2	jkhinlkjih
EPZ x Tipsy Star & One	kkiiongjtn
ES Lab ES-1a	wkkjmbrhth
Eskuche 33 1 3 B	xcihfhuovt
ETA Mini Closed	mljdohoovk
ETA Mini Semi-Closed	nlkenhnouj
ETA Mini Semi-Closed (with ring dampeners installed)	oljenhnpvl
ETA O2	weginigtrl
Eternal Melody EM6W	qjecjpmupt
Etymotic EK5	wnlkmkdlsq
Etymotic ER2SE	wnljmlcnun
Etymotic ER2XR	nnkimmdovm
Etymotic ER2XR (brown filter)	jpkimmerjg
Etymotic ER2XR (green filter)	iokhmlgqmf
Etymotic ER2XR (white filter)	kpkimncrih
Etymotic ER3SE	xmjjllemxs
Etymotic ER3SE 75 ohm	wkjjmmdmvn
Etymotic ER3XR	tkhhlmgpws
Etymotic ER4B	umokmnajpi
Etymotic ER4P	xmkikleoxr
Etymotic ER4S	vnljlmcmtk
Etymotic ER4S (CIEM)	wnmjmmamvj
Etymotic ER4SR	vnljmkdkvn
Etymotic ER4XR	vljjmlfmum
Etymotic ER4XR (2-flange eartips)	ulihllhqlj
Etymotic ER4XR (3-flange eartips)	ulihllhqmj
Etymotic ER4XR (foam eartips)	vliillhokj
Etymotic ER6i	wnkkljhjus
Etymotic ERX	tljlpifljo
Etymotic ERX (brown filter)	rliimkgqpi
Etymotic ERX (green filter)	rliiljhspk
Etymotic ETY Kids	unljmmdljk
Etymotic EVO	nnkimlfnqn
Etymotic Evo (2-flange eartips)	mnjhmlgpol
Etymotic Evo (3-flange eartips)	lnjhmlgpqn
Etymotic hf2	xmjjljgpvp
Etymotic hf3	xnkjljfoxq
Etymotic hf5	xnjjljgmxq
Etymotic mc3	wnlkmhfptr
Etymotic mc5	wnkjmgfpvs
Etymotic Mk5	vnmknkcktr
Etymotic mk5 Isolator	vnkjmlepki
FAAEAL Hibiscus	tkjjnncjyp
FAAEAL Iris	zjblktanwm
FAAEAL Snow Lotus	vqfemjksns
FAAEAL Tulip	flggnnpclj
Fairphone Fairbuds	hskakgvpiw
Fairphone Fairbuds (flat eq, ANC Off)	mkhegitsqu
Fairphone Fairbuds (flat eq, ANC On)	lohekessot
Fairphone Fairbuds XL	atjikhkuen
Fatfreq 20.6	tifellhzrj
Fatfreq 20.6 (bass switch on)	qiedlmhzsk
Fatfreq 20.8	mjeekkosps
Fatfreq Eden	sjgejoiunq
Fatfreq Grand Maestro (black module, down)	9oiinnfqm9
Fatfreq Grand Maestro (black module, up)	epljllfppd
Fatfreq Grand Maestro (blue module, up)	mlkkllepra
Fatfreq Grand Maestro (bluemodule, down)	fliinmfqm9
Fatfreq Grand Maestro (down)	4qiinllmod
Fatfreq Grand Maestro (up)	aqkkkjllrh
Fatfreq Hayabusa	pmjilkkloh
Fatfreq Hayabusa (bass)	jlhhmllnqj
Fatfreq Maestro	7qjimlhqoj
Fatfreq Maestro Mini	6pjilmlkoe
Fatfreq Maestro SE	2qjinmhooi
Fatfreq Musician	xlgginlmus
Fatfreq Musician Plus	mkecipotvm
Fatfreq Musician Plus V2	7oihnmhpws
Fatfreq Musician Pro	qjfdhlqvos
Fatfreq Musician Pro SE	8qkimmhmwr
Fatfreq Reference	wkigjnious
Fatfreq Reference Plus	skhfjnfytt
Fatfreq Reference Plus V2	vjhfjnkqwr
Fatfreq Reference Pro	vkighjnskn
Fatfreq Reference Pro SE	ukhglpgmts
Fatfreq Sakura	pmjilkfqtl
Fatfreq Sakura (bass switch on)	mmiimlfrum
Fatfreq Scarlet Mini	0neeoomosg
Fatfreq Tsuru	vligijmtjn
Fatfreq x Effect Audio Quantum	hliinmcul8
Fatfreq x HBB Deuce	9jlmkkkjpi
FAudio Chorus	ojfdkopmro
FAudio Dark Sky	ikfjlmhrin
FAudio Mezzo (off-off-off)	kidepqipli
FAudio Mezzo (off-off-on)	jiddopjrnj
FAudio Mezzo (off-on-off)	niefqrfikj
FAudio Mezzo (off-on-on)	lieeprhkmk
FAudio Mezzo (on-off-off)	lidepqioih
FAudio Mezzo (on-on-off)	niegqrfihi
FAudio Mezzo (on-on-on)	liefprhkjj
FAudio Minor	rifilklplp
Fearless Audio ACME 8	ji9ctimxrp
Fearless Audio Barcelona	gmhfknjqrt
Fearless Audio Crystal Ball	qifdklkypr
Fearless Audio Dawn	jkjikmioom
Fearless Audio HyperS 12	sjiinoasxe
Fearless Audio La Hire	tjgfkmmlvs
Fearless Audio Lancelot	njfflokquq
Fearless Audio Provence	fnhflnknts
Fearless Audio Roland	npkgjljpxs
Fearless Audio S10 Genie	tjiioncrui
Fearless Audio S4	shfflpnint
Fearless Audio S5H	njfekpojqt
Fearless Audio S5T	uhfdlogysl
Fearless Audio S6Pro	unjhkohhmk
Fearless Audio S6Rui	ojffmpkjus
Fearless Audio S8F	njfelpnknm
Fearless Audio S8Pro	ojfflqkiol
Fearless Audio S8Z	qkgfmnkmmp
Fearless Audio Shangri-la	kniglmkmkn
Fearless Audio Start	lkeenrgnxs
Fearless Audio Tequila	rmigjjmqmv
Fender FXA6	jlgfmohsws
Fender FXA9	rkgdiissxt
Fender Ten 5	oighpkints
Fender Thirteen 6	xlihhgjyut
Fengru EMX500	yhfjjfmwqt
Fengru HE-200	8ledmrqgus
Fidue A31s	fjeenpllxu
Fidue A63	sgdekoltuq
Fidue A65	vgefkpjsrn
Fidue A71	9kdcmpjyst
Fidue A81	piffmqmgjj
Fidue A83	pjgfoocxih
Fidue A91 Sirius	wkhfnnduts
Fidue A91 Sirius (CIEM)	wmiimhipsl
Fifine Ampligame H3	im69Bolhqi
Fifine Ampligame H6 (game)	u80czqrbri
Fifine Ampligame H6 (movie)	ve5ivnp8of
Fifine Ampligame H6 (music)	viadwlq9md
FIIL GS (ANC off)	unkkljdqjm
FIIL Key	h56wdnmrvs
FIIL Key Pro (ANC off)	hnliiqlckf
FIIL Key Pro (ANC on)	anjeduqgkj
FIIL T1 Lite TWS (bass EQ)	6kednsmnkh
FIIL T1 Lite TWS (default EQ)	aohfnrjlig
FIIL T1 Lite TWS (treble EQ)	bpfgorkidd
FIIL T1X	cnifppeqia
FiiO EH3	lpe9krpnns
FiiO F3	kifemklwkm
FiiO F5	olgflqjnlu
FiiO F9	pjffnngubk
FiiO F9 Pro	nkggopcvfh
FiiO FA1	ujhgknjpms
FiiO FA19 (off)	liffllmsjd
FiiO FA19 (on)	jidelmntlf
FiiO FA7	piecinptsn
FiiO FA7S	okgdiksorp
FiiO FA9	plgglhnsok
FiiO FD1	tifgmrjgrl
FiiO FD11	ikggnnholm
FiiO FD15	rigimkirrm
FiiO FD3 (bass eartips)	ikefmokpks
FiiO FD3 (black nozzle)	ijffmolnhr
FiiO FD3 (foam eartips)	jjefmnjqjr
FiiO FD3 (stock nozzle)	ijffmnkqkr
FiiO FD3 (vocal eartips)	ikefmnkqks
FiiO FD5	mjfgmojmlp
FiiO FD5 (narrow nozzle, 3-flange eartips)	kjefnkkwln
FiiO FD5 (narrow nozzle)	hlggmnjqno
FiiO FD5 (stock nozzle)	hlggnnknjl
FiiO FD7	qifhlmjpps
FiiO FD7 (balanced nozzle)	ojfflllrlq
FiiO FD7 (balanced)	ojfflllrlq
FiiO FD7 (bass nozzle, 3-flange eartips)	pjfflilwpo
FiiO FD7 (treble nozzle)	ojffllmqjq
FiiO FDX	pjggllkpmq
FiiO FF1	xhckjondtr
FiiO FF1 (black)	unjnlocfkp
FiiO FF1 (foam)	wkckjqndnn
FiiO FF1 (no foam)	smlolu98dh
FiiO FF1 (white)	tnknmpcdjn
FiiO FH1	ikffnoevqk
FiiO FH11	hkeeonivji
FiiO FH15 (balanced nozzle)	fmhfklktvs
FiiO FH15 (bass nozzle)	dmgfkmkvut
FiiO FH15 (treble nozzle)	fmhgllkrvs
FiiO FH1s	thffmqkirm
FiiO FH3	hnjgohiumn
FiiO FH5	gnhhmiiwll
FiiO FH5s	oliipldnnk
FiiO FH5s (off-off-off)	hniiplfnjh
FiiO FH5s (off-off-on)	nliipldokf
FiiO FH5s (off-on-off)	nliiondnnj
FiiO FH5s (off-on-on)	hniipmfmgb
FiiO FH5s (on-off-off)	nliioldppp
FiiO FH5s (on-off-on)	hniipkgpjg
FiiO FH5s (on-on-off)	hnihplfplk
FiiO FH5s (on-on-on)	nlhioldqmk
FiiO FH7	plgimgiymh
FiiO FH7 (bass nozzle)	olghljkukf
FiiO FH7 (reference nozzle)	olghljlvje
FiiO FH7 (treble nozzle)	olghmikvgd
FiiO FH7S	lkfenpkopg
FiiO FH7s (balanced nozzle)	lkedmpmpog
FiiO FH7s (bass nozzle)	lkeemplqqh
FiiO FH7s (treble nozzle)	lkeemplpmd
FiiO FH9 (black filter)	rkgfloklwl
FiiO FH9 (green filter)	rkgflojluj
FiiO FH9 (red filter)	rkgflpimyp
FiiO FHE Eclipse	fmhhnnhosm
FiiO FP3	qhefmpjomk
FiiO FT1	fnfinkjoml
FiiO FT1 Pro	qkjijkphml
FiiO FT3 (pleather earpads)	pjhhllllli
FiiO FT3 (suede earpads)	njfgqkjmlk
FiiO FT5 (pleather earpads)	tiidhpmpkh
FiiO FT5 (suede earpads)	tihegpnqii
FiiO FT7 (fabric earpads)	rkjikipine
FiiO FT7 (leather earpads)	sjjjmfpkne
FiiO FW5	ilfelpmmlh
FiiO FX15 (off)	jlghkpkksr
FiiO FX15 (on)	ilghkqklng
FiiO JD1	fmhhppggog
FiiO JD10	mifhopgkvl
FiiO JH5	kkggkmpjnn
FiiO Snowsky Wind	spbhoniq09
FiiO x JadeAudio JD3	flggoneuqs
Final Audio A3000	oigglknqgf
Final Audio A4000	klihmnmhgi
Final Audio A5000	cmhfmksigh
Final Audio A8000	lmiinnfnfp
Final Audio Adagio III	alddnque5i
Final Audio B1	tgcelqmoim
Final Audio B2	ukhgkolgut
Final Audio B3	wiffjnnqnn
Final Audio B3 (Final Audio TWS eartips)	vhedilrspg
Final Audio B3 (Final Audio Type E eartips)	vhedilsplj
Final Audio D7000	mhhcmhtomk
Final Audio D8000	qhgimdtmch
Final Audio D8000 Pro Edition	tihgocrmfg
Final Audio E1000	vifgjmplio
Final Audio E1000 (Final Audio Type E eartips)	vkffikviep
Final Audio E2000	vgdekplsop
Final Audio E3000	qfdelonqlk
Final Audio E4000	pgdelpkqtp
Final Audio E500	wkggjlnmnn
Final Audio E5000	hjgfmnmoqm
Final Audio EVA2020	pgdelnnrpp
Final Audio F3100	vojgilmmoj
Final Audio F4100	xlgginlpvp
Final Audio F7200	xkgfinlpwq
Final Audio FI-DO6SS ANT20	mjedjpnsnu
Final Audio Heaven 4	rkgejnnpqu
Final Audio Heaven 7	wmhfinloqs
Final Audio Heaven 8	qiedjoorvs
Final Audio Heaven A	vlhhjmkpip
Final Audio Heaven II	wljijlgsol
Final Audio Heaven III	dja9oswfaq
Final Audio Heaven IV	qlhejmopst
Final Audio Heaven S	pkfejpnplu
Final Audio Heaven V	qlgfknmoms
Final Audio Lab 1	uheejomrou
Final Audio Lab 1 Fit 1	vliia9Avxv
Final Audio Lab 1 Fit 2	yqgejepuut
Final Audio Make 2	vgddkopmlp
Final Audio Pandora Hope 4	ikjgliqltk
Final Audio Sonorous III	vnoaleosjl
Final Audio Sonorous IV (A-type earpads)	pfgnlir9pf
Final Audio Sonorous VIII	Bdbhfhxpvp
Final Audio Sonorous X	zjdgfgwqvm
Final Audio UX3000	imdlojjqeo
Final Audio UX3000 (Bluetooth, ANC on)	nffkmhomos
Final Audio UX3000 SV (analog connection)	ukafmpnngk
Final Audio UX3000 SV (ANC off)	wikisfbung
Final Audio UX3000 SV (ANC on)	ogikuiarqj
Final Audio VR2000	ljgglitkce
Final Audio VR3000	kjgflisnbf
Final Audio ZE3000	tjfflpiqjd
Final Audio ZE8000	lkecijsxoe
fineEars TSH-HR1000K	bkedmrphuo
Fir Audio e10	mhefnohseq
Fir Audio e12	elffopiobm
Fir Audio Krypton 5	lkdbmnmwol
Fir Audio M2	njhhnsejtg
Fir Audio M3	mkgfomipon
Fir Audio M4	mligkoinmm
Fir Audio M5	okgflnjpkm
Fir Audio M5 (CIEM)	nnkijnglsu
Fir Audio M5 S2	mmigjmknvl
Fir Audio Neon 4	mjdcmojwvm
Fir Audio Radon 6	ijfgipnoke
Fir Audio Radon 6 (black module)	khhihnmqhe
Fir Audio Radon 6 (gold module)	khgihnmqhe
Fir Audio Radon 6 (red module)	khghiomqie
Fir Audio Radon 6 (silver module)	lhgiiomqhe
Fir Audio VxV	qjfgjnnnsp
Fir Audio Xenon 6	kiccksnrok
Fir Audio Xenon 6 (CIEM)	micclslrsl
First Harmonic IEB6	vjegmooffl
Fischer Audio FA-003	sjanljrbpn
Fischer Audio FA-011 LE	tcghhhuqmk
Fischer Audio Oldskool RPM 33 1-3 (Zeppelin & Co Limited Edition)	wiimfhmtgr
Fischer Audio Omega Spark	rnlhkks79o
Fischer Audio SBA-03	vlihjlipht
Fischer Audio Tandem	ylgfigrqwn
Fitbit Flyer	p2flmnhqtl
FitEar Air 2	shefmpewhj
FitEar Aya	pkfejmoqqt
FitEar EST	tjgfjkpmmu
FitEar F111	ilecinssmu
FitEar Fitear	nlfdimotvs
FitEar MH334	tjfejmlurt
FitEar MH334SR (CIEM)	sifdjmmvot
FitEar MH335DW	njecinptiu
FitEar Monet 17	ljdbirtndp
FitEar Parterre	jkdbiortpr
FitEar Private 222	qkgekomliw
FitEar Private 223	tnjhlljl8o
FitEar Private 333	tkhfknlmet
FitEar Private C435	yigfljhysu
FitEar TG334	qjfdjlnvot
FitEar Titan	theflqgukh
fix Bespoke Edition (Leneo)	lnjfkljtlm
fix Event Horizon	rkffjmkuoh
Flare Audio Reference R1	Ckbi9onyws
FLC Technology DD31	mhcbjqvldg
FLC Technology FLC8 (gray LF, grey ULF, black HF)	llihlgmxib
FLC Technology FLC8 (gray LF, grey ULF, blue HF)	jlhekfqxuo
FLC Technology FLC8 (light, grey LF, grey ULF, blue HF)	vmihlfkxga
FLC Technology FLC8 (pop-rap, black LF, grey ULF, black HF)	jkhgkhoxjb
FLC Technology FLC8 (strings-piano, clear LF, clear LF, green HF)	umihlfmvc9
FLC Technology FLC8 (vocals, clear LF, clear ULF, yellow HF)	xmjilkcwqe
FLC Technology FLC8D (gold filter)	enihohksnd
FLC Technology FLC8D (gunmetal filter)	dnigmgptgb
FLC Technology FLC8P (gold, black, gunmetal)	fkeeljrvef
FLC Technology FLC8P (gold, black, red)	blfemirvff
FLC Technology FLC8P (gold, black, transparent)	umigmgnrcd
FLC Technology FLC8P (gold, gray, gunmetal)	imigmgptdd
FLC Technology FLC8P (gold, white, gunmetal)	lnjhmfnrcd
FLC Technology FLC8P (green, gray, gunmetal)	hmhgkfts8c
FLC Technology FLC8P (gunmetal, black, gunmetal)	ekeekjtvef
FLC Technology FLC8P (gunmetal, gray, gunmetal)	hmhgkfstcd
FLC Technology FLC8P (silver, gray, gunmetal)	jmihnijulj
Flicker Ear Flow	uhdfpkojoo
Flicker Ear Norma	sifdilrsus
FlipEars Aegis	mhfhoohkql
FlipEars Aether	flhhrgfyme
FlipEars Aurora	mkffolhton
FlipEars Legion	rheenqhqof
Floaudio CALLA	dlggomgujl
Focal Azurys	fkjkjnlkql
Focal Bathys	ljjgiokolm
Focal Bathys (USB)	jjjhglmunm
Focal Bathys (wired)	kjjhglmtml
Focal Bathys (wireless)	kjkghmktmn
Focal Bathys MG	jikfgooooi
Focal Bathys MG (dynamic preset)	ghmhgmnnpg
Focal Celestee	llfokhirpm
Focal Clear	viiingkorn
Focal Clear (Focal Clear Mg earpads)	whhimemrtp
Focal Clear Mg	uihingkswm
Focal Clear MG Professional	xkgiohjplm
Focal Elear	uiiilijssm
Focal Elear (Elex earpads)	wiiinhjqrn
Focal Elear (Utopia earpads)	wiijofmkro
Focal Elegia	qjkjjgktnp
Focal Elex	viiinglmpp
Focal Elex (worn earpads)	wihingitrl
Focal Hadenys	ogijnhohmm
Focal Listen	onrcjilppk
Focal Listen Professional	vmqdfhopgh
Focal Radiance	mldmlkjpqk
Focal Sphear	sieelploht
Focal Spirit Classic	pkiigiqnnk
Focal Spirit One	ilcikisnpq
Focal Spirit One S	jkcjlitjsj
Focal Spirit Professional	kkhilkpiwl
Focal Stellia	nkaomjirpr
Focal Utopia	vhhingokqo
Focal Utopia (Dekoni fenestrated Sheepskin Earpads)	righlgqmuo
Focal Utopia (Dekoni sheepskin Earpads)	qiggmgpptp
Focal Utopia (Elear earpads)	piggmmmnql
Focal Utopia 2022	vihhmgnmsp
Focus Audio EDM	7lealsmsks
Focusrite HP60 (Scarlett Studio)	wghkjgolen
Fonge X2 Pro	ckedoqnjlm
Fosi Audio i5	yefjnekxgh
Fostex T-X0	wjfarhslon
Fostex T20RP Mk3	xe9hqjrhqk
Fostex T40RP Mk3	ogfhkhtnmk
Fostex T50	wnojihilwm
Fostex T50RP	wpkglelsuo
Fostex T50RP (sample 1)	xpkglelsup
Fostex T50RP (sample 2)	xpkfkflttn
Fostex T50RP 50th Anniversary	vehklaspcj
Fostex T50RP Mk2	vgjgldmwtq
Fostex T50RP Mk3	ufgjlfukdh
Fostex T50RP Mk4	tfimj9pwdl
Fostex TH-X00	nkkklflnhh
Fostex TH-X00 (ebony)	skkklhiphm
Fostex TH-X00 (mahogany)	rhjlodfwfl
Fostex TH-X00 (mahogany) (sample 1)	ohghojmnji
Fostex TH-X00 (mahogany) (serial number 1927)	mkhhninokh
Fostex TH-X00 (purpleheart)	pghgokhsgj
Fostex TH-X00 (ZMF Universe perforated lambskin earpads)	hmnlodnfdi
Fostex TH-X00 (ZMF Universe perforated suede earpads)	imnmndmfci
Fostex TH500 (worn earpads)	wnagmfssjn
Fostex TH500RP	wqcekfrtqn
Fostex TH600	hiddtgslfl
Fostex TH610	qjgfliskjm
Fostex TH610 (Dekoni fenestrated Sheepskin Earpads)	sjikmgqbki
Fostex TH616	qgfgjmtfjh
Fostex TH7	wjfjigrmmm
Fostex TH900	fjddrguigl
Fostex TH900mk2	higgpeughl
Fostex TH900mk2 (anniversary tuning)	oiginfrkhi
Fostex TH900mk2 (TH610 earpads)	nhgellqooh
Fostex TH909	kjifhoshll
Fostex TM2	nkjjnp9ugd
Fostex TR-80	wi8ipllonm
Fujisan Telos	wkfeknjtkp
Future Sonics G10	gkfforgmxt
Future Sonics MG5HX	dlffpofpsr
Geek Wold GK10	tgddkrlqoi
Geek Wold GK3	jkghosfgDt
Geek Wold GK80 (microphone cable)	cniips7qzs
Geek Wold GK80 (normal cable)	bnhhrt8ogf
Geekfly GF10	ekggophkmj
Geekfly GF8S	9mggpphkti
Genesis Neon 613	yj99phvuek
Genesis Radon 800 (farbic earpads)	xibhjllxek
Genesis Radon 800 (leather earpads)	uh7jhpnvdh
Genesis Toron 301	xgbjmfmwpt
Genesis Toron 531 (breathable earpads)	vbpoekgojg
Genesis Toron 531 (hybrid earpads)	o8fnjmirki
GK G1	xjgeipoixs
Gold Planar GL12 (filter)	xjhfhiotxk
Gold Planar GL12 (no filter)	xkhghhroxi
Gold Planar GL20	xljjh7qytj
Gold Planar GL2000	vjiimcqook
Gold Planar GL2000 (double-sided, leather earpads)	viihkbtpml
Gold Planar GL2000 (double-sided, perforated hybrid earpads)	wihincpomi
Gold Planar GL2000 (single-sided, leather earpads)	wijhlasmsr
Gold Planar GL2000 (single-sided, perforated hybrid earpads)	xhjgobsjtp
Gold Planar GL850	whihkcnwpn
Google Pixel Buds (2017)	up9hiukmii
Google Pixel Buds (2020)	skklkhkknj
Google Pixel Buds A-Series	rinngkkgib
Google Pixel Buds Pro	blogomkemu
Google Pixel Buds Pro 2	hkkgmnkjbo
Google Pixel USB-C Earbuds	wochfqjsou
Grado GR10	vmihijlolq
Grado GR8	rlgeikqoou
Grado GS1000	ug9knlsb6h
Grado GS3000e	tpgiopggcl
Grado GT220	iighopgjln
Grado GW100	sfgelsdtij
Grado GW100 (bluetooth)	xeefmt9xhj
Grado GW100 (wired)	vkhllq5ugk
Grado Hemp	wjhjlneqpi
Grado HF1	vhflnnghjj
Grado HF1 Prototype	tlflnmifbh
Grado HF2	vjflnpdkil
Grado iGE	hlhgmhkypq
Grado iGi	rifgmenzhl
Grado iGrado White	volijjiopj
Grado PS1000	uhblokpd5i
Grado PS2000e	tpgiopggeh
Grado PS500	ydbkomfrsn
Grado PS500e	xebknnhmor
Grado RS1	tmfknogfbj
Grado RS1e	vqgiotajpk
Grado RS1e (bowl earpads)	xodknp7tvr
Grado RS1e (flat earpads)	zlbkmjexvq
Grado RS1e (S earpads)	zfdhlnewws
Grado RS1e (yellow earpads)	Agdilndwws
Grado RS1x	uogkmr9nlh
Grado RS2	snhknnhe9i
Grado SR125e	tljlmpbk9g
Grado SR125i	wiglmpcklm
Grado SR225	snjknmm6bd
Grado SR225e	tljlmpbk9d
Grado SR225i	ukglnoeigj
Grado SR225i (comfy earpads)	wihkmpclom
Grado SR225i (G earpads)	tkfknlpc6j
Grado SR225i (goo bowl earpads)	ukglnoejgi
Grado SR225i (reverse bowl earpads)	vjgkmofnjj
Grado SR225i (small flat earpads)	xifjkmgsom
Grado SR225i (TTVJ flat earpads)	xhfjkmhsnm
Grado SR325	tljlnnfebe
Grado SR325e	tljlmpalcc
Grado SR325i	ulgknoggfi
Grado SR325x	xffikmgrpi
Grado SR60	tjikmmiffh
Grado SR60e	vjillobmjl
Grado SR60i	whgkmpcmop
Grado SR60x	umjlmobjkh
Grado SR80	snkkomk7bh
Grado SR80 (L-Cush earpads)	tnklno7ode
Grado SR80 (S-Cush earpads)	vmjlmp6qli
Grado SR80e	tkilmpbnbg
Grado The Hemp Headphone	whglkodqpf
Grell Audio TWS 1	hgialwhoim
GS Audio GD11	rlhfjhnvur
GS Audio GD3A	bqiflmokjn
GS Audio GD3C	dohelmokqt
GS Audio GT12X	jkedkkoxuk
GS Audio SE11	lnhfkllsih
GS Audio SE12	kkfgnklqgq
GS Audio ST1	olhfkmnmlt
GuideRay GR-I	kihfqklkfs
HAKUGEI Sea-elf	anhhorggxp
Harman Kardon FLY ANC	cmfhpknjor
Harman Kardon NI	fmhinqjcsq
HarmonicDyne Black Hole	ilbforhoip
HarmonicDyne Devil	pliinnfnbq
HarmonicDyne G200 (lambskin earpads)	qjfffmspql
HarmonicDyne G200 (velour earpads)	rjhgifsstk
HarmonicDyne Helios	vhdhmpmggf
HarmonicDyne P.D.1	fmhinrekyo
HarmonicDyne Poseidon	xlbciospln
HarmonicDyne Zeus	whdejooopn
HarmonicDyne Zeus Elite	mighllqkli
Havi B3 Pro1	yliiggpowh
Haylou GT1	9jcclossoc
Haylou GT2	emjgkmlppg
Haylou Moripods	o7chgrpolt
Haylou PurFree Buds	Ec9hbcDxyw
Haylou S30 (ANC on)	s7jqhepmaf
Haylou S30 (wired)	vo9ijisohl
Haylou S35	kdcnqhgqhf
Haylou S35 (ANC off)	becrlfnoaf
Haylou S35 ANC	q9ionmdmpd
Haylou W1 ANC	ghkmkmepp9
HeartField Blanc	qkgfllnpai
HeartField CU8	dnjjmkhnmp
Heavys H1H (AUX power off)	in6hssjhxo
Heavys H1H (Hell Blocker off)	eh9ljslluf
Heavys H1H (Hell Blocker on)	igfjiqlltf
HEDD Audio HEDDphone Two GT (leather earpads)	shfjpjkkrf
HEDD HEDDphone	wgigmgrjxi
HEDD Heddphone 2	wiihlgplxk
HEDD HEDDphone Two GT (leather earpads)	rieiqjjkrg
HEDD HEDDphone Two GT (suede earpads)	rjfipjkksg
Heir Audio Tzar 350	tkgfikoufi
Hessian TWS7	7lhgprfqei
Hi-Fri Audio Aphex	jjeemlsleg
HiBy Crystal 6	rjgejroiho
HiBy Crystal 6 II	qjedjrqjid
HiBy Seeds II	ekefnrndpl
HiBy WH3	ikeemqmmyn
HiBy x FAudio Project Ace	nlihkjlrbm
HiBy XENO	vgeflqkkAn
HiBy XOE	jhcclovjee
HiBy Yacht 10	lkgglmhvfn
HiBy Yves	uhefmopdlo
Hidition NT6	slhgklitkl
Hidition NT6 Pro	olhemngugl
Hidition NT6 Uni	ukihlkirgo
Hidition NT8	rmkjmgfwoi
Hidition Viento	umjikmhmmg
Hidition Viento (bass, mids)	nnjgjojpoi
Hidition Viento (bass)	mnkhkmimoh
Hidition Viento (mids)	tliginjppj
Hidition Viento-A (CIEM)	ulkikmhkrh
Hidition Viento-B (CIEM)	mokhkmjmqi
Hidition Viento-D (CIEM)	mmifiokpsn
Hidition Violet	gkjjjjltij
Hidition Waltz	pighnlgqmp
Hidizs MD4 (off-off)	uifdltijog
Hidizs MD4 (off-on)	vjfekqkjrk
Hidizs MD4 (on-off)	tjfdismlrh
Hidizs MD4 (on-on)	vifeiqnksl
Hidizs Mermaid MM2 (balanced filter)	jkghmlirjf
Hidizs Mermaid MM2 (bass filter)	nhddlrnkuq
Hidizs Mermaid MM2 (reference filter)	ljghorektn
Hidizs Mermaid MM2 (treble filter)	mjhjorcktm
Hidizs Mermaid MS1	kidenomokj
Hidizs Mermaid MS4	kkghprbopl
Hidizs MK12 (gold nozzle)	plhgnofnup
Hidizs MK12 (red nozzle)	llgfnmiquo
Hidizs MK12 (silver nozzle)	plhhnofktp
Hidizs MP143	flhgnjjumj
Hidizs MP143 (gold nozzle)	glggnkjvih
Hidizs MP143 (red nozzle)	bleelkrtjh
Hidizs MP143 (silver nozzle)	hlghnlgvgh
Hidizs MP143 Golden Titanium (gold nozzle)	glggnkitik
Hidizs MP143 Golden Titanium (red nozzle)	bleelkrshj
Hidizs MP143 Golden Titanium (silver nozzle)	hlgholgtgk
Hidizs MP145	hkghnljrmd
Hidizs MP145 (red nozzle)	jlhhmljpnc
Hidizs MP145 (rosegold nozzle)	klhinlipnc
Hidizs MP145 (silver nozzle)	klhinlhnmb
Hidizs MP145 Golden Titanium Edition (red nozzle)	hkggmkmrne
Hidizs MP145 Golden Titanium Edition (rosegold nozzle)	ilggmljroe
Hidizs MP145 Golden Titanium Edition (silver nozzle)	ilghnmiroe
Hidizs MS2	sjggnnhpnc
Hidizs MS3	sighongmhd
Hidizs MS3 (red nozzle)	kkffnloned
Hidizs MS3 (rosegold nozzle)	pkggomimhd
Hidizs MS3 (silver nozzle)	pkghonhmid
Hidizs MS5	jlfgnhsnfm
Hidizs MS5 (red nozzle)	gleemkrokq
Hidizs MS5 (rosegold nozzle)	hlefljroiq
Hidizs MS5 (silver nozzle)	hlefljsngq
Hidizs ST2 Nebula	pfdempnnih
Hidizs ST2 Pro	nhdempnlii
HiFi Boy OS V3	lkedknnsqs
HIFI FOR ALL Dahlia (balanced resonator)	ugillijljm
HIFI FOR ALL Dahlia (dynamic resonator)	ugilmiimim
HIFIMAN Ananda	ujiiikreoj
HIFIMAN Ananda (V1)	vhhijivdnf
HIFIMAN Ananda BT	uhhjkjsegf
HIFIMAN Ananda Nano	riikjkoike
HIFIMAN Ananda Stealth	sjiijkqglg
HIFIMAN Arya	skihimqekj
HIFIMAN Arya Organic	rihkjkqele
HIFIMAN Arya Stealth Magnet Version	sjihjjsdli
HIFIMAN Arya Unveiled	skiikiqhjl
HIFIMAN Audivina	vdgrm9nnhk
HIFIMAN Bolt	5ohfnrobnm
HIFIMAN Deva (wired)	whihlgqjpn
HIFIMAN Deva (wireless)	vnjhkgqjol
HIFIMAN Deva Pro	whhilfqjrm
HIFIMAN Deva Pro-wired	wiiikinlql
HIFIMAN Edition S (closed back)	uijksijaqg
HIFIMAN Edition S (open back)	vhghmmobri
HIFIMAN Edition X	uhjhkiqios
HIFIMAN Edition X V2	tjighjsipo
HIFIMAN Edition XS	siiijlphme
HIFIMAN Edition XX	rjhghlufpr
HIFIMAN HE-300	njhgwmh8rm
HIFIMAN HE-300 Rev 2	veeiqnkbom
HIFIMAN HE-4	sjjgkkubd7
HIFIMAN HE-400	rlihl8vpf9
HIFIMAN HE-5	tjjgfnuejf
HIFIMAN HE-500	sjjijhrhkf
HIFIMAN HE-500 (FocusPad-A)	skjhjgrltj
HIFIMAN HE-5LE	rlkegkwhcd
HIFIMAN HE-6 (6-screw, HIFIMAN FocusPad earpads)	tjjjhlpfmi
HIFIMAN HE-6 (6-screw, pleather earpads)	ukjjkgpkli
HIFIMAN HE-R9	ldccokvmmh
HIFIMAN HE-X4	wiihkgsjlh
HIFIMAN HE1000	mmihijshgn
HIFIMAN HE1000 Stealth	riiiljrelg
HIFIMAN HE1000 Unveiled	tkiijkojhj
HIFIMAN HE1000 V1	v2lkneteen
HIFIMAN HE1000 V2	skjhlmmfjj
HIFIMAN HE1000se	uhiikjsckf
HIFIMAN HE1000se (Dekoni fenestrated sheepskin earpads)	plkjkhpjki
HIFIMAN HE350	ujhjlfvcdh
HIFIMAN HE35X	rgebktw5su
HIFIMAN HE400i	uljiljnkgf
HIFIMAN HE400i (2016)	wkhikjpimi
HIFIMAN HE400i (2020)	vhihkhrljh
HIFIMAN HE400S	vkiilhphpo
HIFIMAN HE400se	uijijgtiki
HIFIMAN HE400se (non-stealth magnet)	vkjjjipkkf
HIFIMAN HE400se (stealth magnet)	vjkhijqimi
HIFIMAN HE4XX	viiilhpjog
HIFIMAN HE560	skihjhwbmk
HIFIMAN HE560 (V1)	skjgkfwdoj
HIFIMAN HE560 2014	slkglhuakk
HIFIMAN HE5se	vjhjjexalj
HIFIMAN HE5XX	wihhlfqlml
HIFIMAN HE6	tjjjletdoi
HIFIMAN HE6 (6-screw, velour earpads)	ujjjlfsemi
HIFIMAN HE6se	tkjhhivaok
HIFIMAN HE6se V2	tkjiiitcok
HIFIMAN Isvarna	me9ithktnk
HIFIMAN Jade II	wjhkjjqdtl
HIFIMAN RE2000	sjgfmrjfnh
HIFIMAN RE2000 Pro	njedmsmhpi
HIFIMAN RE262	xljhjgfAtr
HIFIMAN RE272	xmkhkkbvsk
HIFIMAN RE300	okfdlhozos
HIFIMAN RE400	vlhhlndvip
HIFIMAN RE400 (double flange eartips)	vliikmdtmo
HIFIMAN RE600	ulihmidzss
HIFIMAN RE600S	wliigfnvrt
HIFIMAN RE800	tmoggpmfcn
HIFIMAN Shangri-La	tkiihjvafb
HIFIMAN Shangri-La Jr	vjiijkpfoh
HIFIMAN Sundara	wiiikgucok
HIFIMAN Sundara (2018)	ujjijitbjj
HIFIMAN Sundara (Dekoni sheepskin Earpads)	vkkimdnmoi
HIFIMAN Sundara (post-2020 earpads)	vijilhokni
HIFIMAN Sundara (pre-2020 earpads)	tjjikhtcpi
HIFIMAN Sundara Closed-Back	qiidrgiulm
HIFIMAN Sundara Silver	vjjgngpgng
HIFIMAN Susvara	tjihjitgkj
HIFIMAN Susvara Unveiled	tliiikphkj
HIFIMAN Svanar	jiefnqlipl
HIFIMAN Svanar (ANC Hifi)	rgdempokem
HIFIMAN Svanar (ANC)	lnehjnrfin
HIFIMAN TWS600	ynnlpi3uyr
Hisenior Cano Cristales	dkgjlmmlkj
Hisenior Mega 5 EST	mjjjjjkpqd
Hisenior Mega 5 EST (CIEM)	hjgilkkrsh
Hisenior Mega 5 EST (sample 1)	ikiijknnrr
Hisenior Mega 5 EST (sample 2)	iljiijoomf
Hisenior Mega 5 EST Bass+	clghklopmg
Hisenior Mega5P	mmijmhisok
Hisenior Okavango (off-off)	klggnkkqmm
Hisenior Okavango (off-on)	klggnkktib
Hisenior Okavango (on-off)	hkfenknspp
Hisenior Okavango (on-on)	gkeenkmulf
Hisenior T2	llgcjlptop
Hisenior T2U	pkgejkotkp
Hisenior T4 (off-off)	plggmkmomn
Hisenior T4 (off-on)	plggmklpmg
Hisenior T4 (on-off)	olgfmlmomp
Hisenior T4 (on-on)	olgfmkmpmg
HiSoundAudio BA-100	ulihkirftt
HiSoundAudio Crystal	pkgfmmmnkj
HiSoundAudio Golden Crystal	elgfmmmrff
HiSoundAudio Hiphone HP4	ckcbjnutlm
HiSoundAudio Wooduo	8kcblqwhmr
Horluchs HL4300	rkgejniwlu
House of Marley Exodus Second Pair	vkiilgsgos
House of Marley Legend	skgejljwut
House of Marley Liberate XLBT Wired	njianipsws
House of Marley Positive Vibration 2	wkglobmppi
House of Marley Smile Jamaica	ejb9irsusv
House of Marley Stir It Up	kjdjefzotu
Howard Leight Sync	tqecmwdr37
Huawei Free Buds Pro 3 (ANC max)	cuoljkhjpc
Huawei Free Buds Pro 4 (default eq)	bpphinjklf
Huawei FreeArc (ANC off)	vlthmjcjof
Huawei Freebuds 4i	kkgimlmlno
Huawei Freebuds 5	x76jxkhjpm
Huawei Freebuds 5i (ANC off, awareness)	mmijkknkpn
Huawei Freebuds 5i (ANC off, bass boost)	jhcgkmskro
Huawei Freebuds 5i (ANC off, treble boost)	mmjnocngih
Huawei Freebuds 5i (ANC off)	mmhjkkmjrm
Huawei Freebuds 5i (ANC on, bass boost)	kidihlujoo
Huawei Freebuds 5i (ANC on, treble boost)	nokplaofgi
Huawei Freebuds 5i (ANC on)	nnjlhioion
Huawei Freebuds Pro	udehmmmnoo
Huawei Freebuds Pro (ANC off)	wifgkmmnlo
Huawei Freebuds Pro (ANC on)	shfiklommo
Huawei Freebuds Pro 2	ikqjmhjjmi
Huawei FreeBuds Pro 4 (ANC off)	gnnigmlnhf
Huawei FreeBuds Pro 4 (ANC on)	dpqhgmmiif
HUM Dolores	ukigmkjlnu
HUM Hong Kong Reference	wlihjlhqus
HUM Hong Kong TT	tjgflpkirt
HUM Pristine Reference	tkgglpgmst
HYLA CE-5	imiipmflmm
HYLA Nerva X	nkgfkkkxtp
HYLA Sarda	olhipndlki
HYLA TE-5B	glhhonfnoo
HYLA TE-5T	kmjlrmaiim
HyperX Cloud	rdbpkkitbf
HyperX Cloud Alpha	rhfdmpisig
HyperX Cloud Alpha S	phfgkrirjg
HyperX Cloud Alpha Wireless	clgjisgsad
HyperX Cloud Core	oidjnmiqbd
HyperX Cloud Flight	ohdnqfmkcd
HyperX Cloud Flight S	mhcsojctgd
HyperX Cloud II	nhcjnmhted
HyperX Cloud II Wireless	jjfiooinfc
HyperX Cloud III	uhnmifhsci
HyperX Cloud III Wireless	ogipielqgs
HyperX Cloud Mix	nhgdrihxjf
HyperX Cloud Revolver	ohfjqmbulj
HyperX Cloud Revolver + 7.1	uddgpmhtkg
HyperX Cloud Stinger	hjclulbqif
HyperX Cloud Stinger 2	rfceujjrck
HyperX Cloud Stinger S	pdcmthfpae
HZSOUND Heart Mirror	vmihlmepjn
HZSOUND Heart Mirror Pro	nkhhmnikum
HZSOUND Heart Mirror Zero	ukhgmlhrej
HZSOUND HZ-EP001	llheikslyp
HZSOUND HZ3	rjgfiltiio
HZSOUND LUNA	klghnmioqd
HZSOUND White Snow	hlhhnmkipi
I-INTO i8	flffimostr
I-Mego Throne	iichggwtwu
iBasso 3T-154	plhhnkfprt
iBasso AM05	vlihljirnm
iBasso IT00	imgdjpnmrq
iBasso IT01	gmgejoonmo
iBasso IT01S	pjffkqllmo
iBasso IT01X	ikfflnnnqm
iBasso IT03	dojfkjmsis
iBasso IT03w	lmhglmjofo
iBasso IT04	plhfnmhtlm
iBasso IT07	imigmpfqpr
iBasso Jr. KLEE	ojghnniljn
iBasso SR1	pleeljqrnw
iBasso SR2	unnkkaqigu
Ice Lab Prismatica	klgelolojh
Ice Lab Prismatica Gold	jkfelpjrnd
Ice Lab Spectrumica (orange eartips)	kjeelmmujd
Ice Lab Spectrumica (purple eartips)	kjeelmnuld
iClever Boostcare	tlors0iu6n
iClever BTH02	meebojqvmo
iHarmonix iHX Pro ev-Series	nlhinqehtt
iHarmonix Platinum ev-Series	dkdclpqmqu
iKF Y3	uoeotw0gnh
IKKO ActiveBuds	fhogdhssku
IKKO OH1	kkhhnoihor
IKKO OH10	ilghopgksh
IKKO OH1S	unkhkpcpmh
IKKO OH2	xjggkpgmxp
IKKO OH300	ofdfosjjpf
IKKO OH5	xjffkolkvn
IKKO OH7	fkfgoninur
iMetal iM590	elggnnhrjs
IMR Acoustics Aten (silver nozzle, blue filter)	lhcdksoomi
IMR Acoustics Na-Le	bmggorglxp
IMR Acoustics R1 (black)	alfentncsi
IMR Acoustics R1 (blue)	unjgiqn9pg
IMR Acoustics R1 (orange)	qkgdiotfpn
IMR Acoustics R1 (pink)	qkgeksmesi
IMR Acoustics R1 (yellow)	9lfensndsj
IMR Acoustics R2 Aten (black nozzle, black filter)	ckcbkrqqki
IMR Acoustics R2 Aten (black nozzle, blue filter)	ckcckrqoki
IMR Acoustics R2 Aten (black nozzle, gold filter)	bkcbkpqvmj
IMR Acoustics R2 Aten (black nozzle, green filter)	ckcbkqptli
IMR Acoustics R2 Aten (black nozzle, purple filter)	ckcbkrprki
IMR Acoustics R2 Aten (black nozzle, red filter)	bkcbkrqrki
IMR Acoustics R2 Aten (gold nozzle, black filter)	4ka9iswoiu
IMR Acoustics R2 Aten (gold nozzle, blue filter)	4ka9iswplu
IMR Acoustics R2 Aten (green nozzle, black filter)	ulsi7nnmge
IMR Acoustics R2 Aten (purple nozzle, black filter)	sjfchqpojh
IMR Acoustics R2 Aten (purple nozzle, purple filter)	tjgdhpppjg
IMR Acoustics R2 Aten (red nozzle, black filter)	fjdckrqqki
IMR Acoustics R2 Aten (red nozzle, red filter)	fkcbkqprkh
IMR Acoustics RAH (black nozzle, black filter)	cleemlnumj
IMR Acoustics RAH (black nozzle, silver filter)	nkfelknumi
IMR Acoustics RAH (blue nozzle, black filter)	dleemlnumj
IMR Acoustics RAH (gold nozzle, black filter)	1ka9kswohs
IMR Acoustics RAH (green nozzle, black filter)	ultj9jlsjg
IMR Acoustics RAH (purle nozzle, black filter)	ukgejknuli
IMR Acoustics RAH (red nozzle, black filter)	fkeemloumj
IMR Acoustics RAH (red nozzle, blue filter)	fkeemlnsmi
IMR Acoustics RAH (red nozzle, gold filter)	fkeemkpvmj
IMR Acoustics RAH (red nozzle, green filter)	fkeemlotnj
IMR Acoustics RAH (red nozzle, no filter)	gkeemloqmi
IMR Acoustics RAH (red nozzle, purple filter)	fkeemkoumj
IMR Acoustics RAH (red nozzle, red filter)	fkeemlotmj
IMR Acoustics RAH (red nozzle, silver filter)	njfelkntli
IMR Acoustics RAH (silver nozzle, black filter)	njeekkotmi
IMR Acoustics Semper (Pink nozzle with pink filter)	ljeclojymk
IMR Acoustics Zenith (black)	uliimrg8xk
IMR Acoustics Zenith (blue)	plhgnnijzk
IMR Acoustics Zenith (gold)	cnhhorhaym
IMR Acoustics Zenith (orange)	wnjgjomczn
IMR Acoustics Zenith (pink)	vnmikrg8wk
INAIR M360	llgekplqvm
InAwaken Dawn	hmhinlkhoj
InAwaken Dawn Ms	imjinljjsk
InEar ProPhile-8	mjghmklplo
InEar ProPhile-8 (bass, treble)	pjfhmklplo
InEar ProPhile-8 (bass)	pjfhmklqmr
InEar ProPhile-8 (treble)	vkihkjkpkn
InEar StageDiver SD2	tlhfjmhwpl
InEar StageDiver SD3	okfckqgyvr
InEar StageDiver SD4	olfchlstip
InEar StageDiver SD5	okfennfxjm
InEar StageDriver 3	pkfdkohwvn
Insignia Digital Wireless Headphones	nhidqheBmd
Intime Miyabi	rkhgmkhtmf
Intime Sho DD	cldeplpmkk
Intime Shu-Mai	rjffpkisjh
Intime Sora	gokiljmjtm
Intime Sora 2	qifanqjumh
Intime Sora Light	9ojhmkokni
Intime Sora Light (2019 Edition)	vmihijmpne
Intime Todoroki GO	9leermhwoe
Intime Yo	tigfnlgxlf
INTUAURA Reference 2019	jojkklgokf
INTUAURA SplendorII	phfgnpjkji
IO Audio Sogno	gojimkkklk
IO Audio Volare	mlkjmkgnmf
iSK HD-9999 (thick earpads)	hkgnpkhhek
iSK HD-9999 (thin earpads)	emhoplhgdf
ISN AUDIO D10	6ohgpqhhwn
ISN AUDIO EBC80	kjfgmkqkkj
ISN AUDIO EST50	hnieikprpj
ISN AUDIO H40	gkffojmtll
ISN AUDIO H50	okgdhmtlnk
ISN AUDIO Neo 1	lkghomjipm
ISN AUDIO Neo 5	jlgjljknqi
ISN AUDIO Rambo II	Ckgf6gBwxv
Itsfit Lab Fusion	omhfinivti
Itsfit Lab R3	vjhfiklvpo
Itsfit Lab R3 (CIEM)	vjhfiklvtp
Ivery IS-1	djb9hruwmi
ivipQ Ker Meng	nqpimihj9f
ivipQ Q-09 Phoenixia	hmiimmlikk
Jabra Elite 10	eiognjklef
Jabra Elite 10 Gen 2	eiqiiljmeh
Jabra Elite 25e	8jdcopnrrl
Jabra Elite 3	hhgklmlmh9
Jabra Elite 3 Active	ekillkkmmk
Jabra Elite 4	ikilnijmgc
Jabra Elite 4 Active	rfgllkjojf
Jabra Elite 45e	rgedkknwqj
Jabra Elite 5	tnckqiioag
Jabra Elite 65e	ekhhkolpc6
Jabra Elite 65t	sffgmnjqgc
Jabra Elite 7 Active	glihnnjjid
Jabra Elite 7 Pro	gljkqjglfh
Jabra Elite 75t	5dtokjcogd
Jabra Elite 8 Active	gcgomhmmfi
Jabra Elite 8 Active 2	kijlgninoo
Jabra Elite 8 Active Gen 2	iejpkmhgko
Jabra Elite 85h	fmjjkiolde
Jabra Elite 85t	dklhmliqmj
Jabra Elite 85t (ANC Off)	ekjfmkkrrq
Jabra Elite 85t (ANC On)	dklinhkqlq
Jabra Elite Active 45e	uondiooii7
Jabra Elite Active 65t	rfggnlkphd
Jabra Elite Active 75t	4dtnkgho95
Jabra Elite Sport	dkbennmwkc
Jabra Evolve 40	vpkfgnlmnr
Jabra Evolve 65t	pfffmnlsha
Jabra Evolve 75e	bkhiirjoc7
Jabra Evolve2 65	phfbunkmfc
Jabra Evolve2 85	ufdmmrfjhd
Jabra Move (wired)	hnfjhirqtr
Jabra Steel	ton4lwnagv
Jabra Talk 45	vltpdhdrbd
Jade Audio EA1	njfgnpliig
Jade Audio EA3	lkghoiiwhe
Jaybird Freedom 2	aidcprhwcd
Jaybird Freedom F5 (2016)	ilhgnqetki
Jaybird Run	hlgfpoewen
Jaybird Run XT	glffoqewhn
Jaybird Tarah	klgfpofrbi
Jaybird Tarah Pro	jlgfpogtff
Jaybird Vista	kkggpndxde
Jaybird Vista 2	imihpnbwbe
Jaybird X2	klgfpljri6
Jaybird X3	glgepngvgl
Jaybird X4	hmhfqofsee
JAYS a-JAYS FIVE	njghnqhjjm
JAYS d-JAYS	xlihjkiqvt
JAYS j-JAYS	lkedlloqst
JAYS q-JAYS	tligjilwkd
JAYS u-JAYS	qihkoennlo
JAYS v-JAYS	vihonqg3sg
JBL CLUB 700BT	dijholknie
JBL CLUB 950NC	sbhknkikeo
JBL CLUB ONE	gihonjjkbh
JBL CLUB PRO Plus TWS	hjoinkhmd9
JBL Duet NC (ANC Off)	dmgqpaphlk
JBL Duet NC (ANC On)	aofkudklik
JBL E25BT	giddnpqleg
JBL E45BT	kjdiyfnehh
JBL E55BT	hl9rpflnjh
JBL E65BTNC	cnelqfplfl
JBL Endurance Dive	ghinmjmhec
JBL Endurance Peak	bkimmjmhii
JBL Endurance Peak 3	0ojiplljjm
JBL Endurance Peak II	6mjlpkjihq
JBL Endurance Sprint	bjimmimjc9
JBL Everest 110	gkedloqmjg
JBL Everest 310	fkjrjfknkb
JBL Everest 710	pmiqldhsbd
JBL Everest Elite 700	mlmjmkeqee
JBL Everest Elite 700 (wired, active)	jmmjnlenqm
JBL Everest Elite 700 (wired, passive)	rnnkjhgstm
JBL Everest Elite 700 (wireless)	llnjmlemon
JBL Free 2018	ekhimmjqkc
JBL Free X	clijlohpme
JBL J55i	jje9okoxus
JBL J88i	phf7waruur
JBL JR300BT	uhghqlgpij
JBL Live 200BT	gjhmkoikfj
JBL Live 300TWS	ckjhnmkogc
JBL Live 400BT	hfrlhjnehi
JBL Live 460NC	fmkkkojihk
JBL Live 500BT	ghhtgnjelj
JBL Live 650BTNC	bnjlphkkgk
JBL Live 660NC	hdnljjllff
JBL Live 670NC	efbkwgnhhv
JBL Live 770NC	8jbkrjokin
JBL Live 770NC (ANC on)	gdekrlfomi
JBL Live 770NC (passive)	nibftdounm
JBL Live Free NC+ TWS	mgjkkkmlic
JBL Live Pro 2 TWS	elkkokkgfm
JBL Live Pro+ TWS	cniflsjjlc
JBL Quantum 100	pocapmorag
JBL Quantum 400	odemmlgufe
JBL Quantum 800	lfcknnhuae
JBL Quantum ONE	oglljrejeh
JBL Reflect Flow	ckjkmngoke
JBL Reflect Mini 2	gmggpngrhc
JBL Synchros E50BT	kienwgdpfg
JBL T200A	eicakruifu
JBL T450BT	weaiphqjxs
JBL Tour One	jkgglnkrci
JBL Tour One M2 (ANC on, studio EQ)	ljgmjnioif
JBL Tour One M2 (ANC on)	jgfmjmipjf
JBL Tour One M2 (passive)	jh2ftmntkm
JBL Tour Pro 2	ofikkmipjl
JBL Tour Pro 3 (ANC on)	kimhkmlihh
JBL Tour Pro 3 (eq off)	flnilkklkj
JBL Tour Pro+ TWS	mfjkolhlgc
JBL Tune 110	7ledmnwflm
JBL TUNE 120TWS	shinllgkg7
JBL Tune 125TWS	ekgmnmfog9
JBL Tune 130NC TWS	iinmkiikme
JBL TUNE 220TWS	tlqqhibodi
JBL Tune 225TWS	tlqqhicldj
JBL Tune 230NC TWS	9mijnliokd
JBL Tune 510BT	m8khnjrefh
JBL Tune 520BT	ubilliohqn
JBL Tune 660NC	fhgnkkksdf
JBL Tune 720BT	ocgoerljld
JBL Tune 720BT (passive)	vnokeikqii
JBL Tune 720BT (wireless)	wjkncphold
JBL TUNE 750BTNC	hgjlmilofa
JBL Tune 760NC	cjkhkpliii
JBL Tune 770NC	ckpkfoljge
JBL Tune 770NC (ANC on, bass EQ)	v5hnkmgnpf
JBL Tune 770NC (ANC on)	ubmpjlemkd
JBL Tune 770NC (passive)	unoneijphh
JBL Tune Beam 2	gjjlimlkni
JBL Tune Buds	7hplkklecr
JBL Tune Flex	fjlknkfpef
JBL Vibe 100TWS	dlkknjhoid
JBL Vibe Beam	fjmlojgjfn
JBL Vibe Buds	ekkmohijhj
JCally AT1	tnidbqwh9j
JH Audio 13v2 (2 o'clock)	lkfdkojxkk
JH Audio 13v2 (max)	gkddlpkxnm
JH Audio 13v2 (min)	skgfjmjvei
JH Audio 16v2	uifeikovmn
JH Audio 16v2 (2 o'clock)	njechlsvsq
JH Audio 16v2 (max)	ijcahmvvvs
JH Audio 16v2 (min)	sjfeilovol
JH Audio Angie (2 o'clock)	ujhglfkxtq
JH Audio Angie (max)	jkfenilxus
JH Audio Angie (min)	xkhhlekysp
JH Audio Billie Jean	mlfdlkmwnt
JH Audio Contour XO (half bass)	sjgeijrtgg
JH Audio Contour XO (max bass)	clfdkkrukj
JH Audio Contour XO (min bass)	vkgfiirtff
JH Audio Diana	rjdbgluvqo
JH Audio JH13v2 (half bass)	mkffkoiwik
JH Audio Jolene (half bass)	vnohj7rvkb
JH Audio Jolene (max bass)	glggmbtvof
JH Audio Jolene (min bass)	vmqgi6rwjb
JH Audio Layla (2 o'clock)	ojgfjfswpl
JH Audio Layla (half bass)	ojgfjfswpl
JH Audio Layla (max)	gjedkhswro
JH Audio Layla (min)	uigfifrwnl
JH Audio Layla AION (2 o'clock)	kkfflfrwqp
JH Audio Layla AION (half bass)	kkfflfrwqp
JH Audio Layla AION (max bass)	fkeemgrwsq
JH Audio Layla AION (min bass)	vjhgjdqwom
JH Audio Lola (2 o'clock)	lmififtueg
JH Audio Lola (max)	bkddlitvkk
JH Audio Lola (min)	unkfheuscf
JH Audio Roxanne (2 o'clock)	tiedhkrvno
JH Audio Roxanne (max)	jjcbimtvtt
JH Audio Roxanne (mid)	wjgfggtwlk
JH Audio Roxanne (min)	wifehjrwkm
JH Audio Sharona	ilghkhrsdd
JH Audio Sheena	lkeeogpueg
JH Audio TriFi 10th Anniversary	ljcbioswmo
Jialai Carat	jkhhnlmigg
JLab Audio Epic Lab Edition (JLab Signature eq)	dkgjmmhre9
JLab Audio GO Air POP	hgcjqnipg9
JLab Audio JBuds Air	4nffpkskde
JLab Audio JBuds Air ANC	mhcirkpdhh
JLab Audio JBuds Air Executive	8jdcqpuc9c
JLab Audio JBuds ANC 3	hjd9mpvfps
JM Audio Editions XTC^2.5 Closed	mgawjgodfr
Jomo Audio Flamenco	uifeirkomn
Jomo Audio Flamenco (bass on, treble on)	sifdismlgr
Jomo Audio Flamenco (bass)	rjedhtmnpo
Jomo Audio Flamenco (treble)	ulhgkriidn
Jomo Audio Haka	mkeciornnu
Jomo Audio Jazz	rkgemjlsqu
Jomo Audio Nautilus	ugginnfnse
Jomo Audio P3	eljiqncokp
Jomo Audio Quatre	jkechntpqu
Jomo Audio Quatre (black)	imhejmnqnt
Jomo Audio Quatre (no filter)	mkecilsrpt
Jomo Audio Quatre (white)	ilgdjmnrot
Jomo Audio Salsa	tkgelkiwit
Jomo Audio Samba	pkfeknmqjo
Jomo Audio Samba (CIEM)	uiffjnlroj
Jomo Audio Tango	kjdckrqjlt
Jomo Audio Trinity	lkgiqofhqp
Jomo Audio Trinity Brass	hkeenommqk
Joyodio Shine (off-off-off-off)	nlhhomgmxj
Joyodio Shine (off-off-off-on)	uljjokekwh
Joyodio Shine (off-off-on-on)	tljjokelvd
Joyodio Shine (off-on-on-on)	vlkkojdjud
Joyodio Shine (on-off-off-off)	hlihomgmxj
Joyodio Shine (on-off-off-on)	lmkjokekwh
Joyodio Shine (on-off-on-off)	hlihomgnwg
Joyodio Shine (on-off-on-on)	lmkjokelvd
Joyodio Shine (on-on-off-off)	imiiomglxj
Joyodio Shine (on-on-on-off)	iliinmglwg
Joyodio Shine (on-on-on-on)	mmkkpkdjud
JQ 4U Pro	lliimjhsol
JQ Audio 4U	ilggoikrll
JQ Hua Jiang	mmjilmfqrh
Just Ear Club Sound	wjcgnqeqpu
Juzear 41T	lnjhoiirnk
Juzear 51T	hmhiphkpnb
Juzear 61T	ilihmkiroe
Juzear 81T	jljkokfnkc
Juzear Clear	dkeenophnh
Juzear x Z Reviews Defiant	lkiimkhsqe
JVC FD01 (modded)	olihlklnsp
JVC HA-FD01	oliilnmdql
JVC HA-FD01 (brass nozzle)	pmkjlmkeuh
JVC HA-FD01 (steel nozzle)	pmkjlmkeuh
JVC HA-FD01 (titanium nozzle)	pnkjlmkeuh
JVC HA-FD02	pkijnnjcxn
JVC HA-FDX1	qkiinlkhri
JVC HA-FDX1 (blue)	okhimimnrm
JVC HA-FDX1 (green)	pkhimjklsk
JVC HA-FDX1 (white)	tmkklljdrf
JVC HA-FR15	8ledlqufai
JVC HA-FR301	jhbaluvapm
JVC HA-FW01	liddlrojus
JVC HA-FW02	sheelrofur
JVC HA-FW03	vjgglojisp
JVC HA-FW10000	ulhhsmehlm
JVC HA-FW1000T	nghkoohgyn
JVC HA-FW1500	njffmqlgrr
JVC HA-FW1800	hkgenpoert
JVC HA-FWX1	ijddmmtjjn
JVC HA-FX6	4ldclrvedq
JVC HA-FX7	gidcmrrkdq
JVC HA-FX7 Gumy	gibblrsmeq
JVC HA-FX99X-B	jjehmmpgwq
JVC HA-FXT90	tgdelnrijp
JVC HA-S500-Z	rehaqdrrrn
JVC XX Elation HA FR100X	uhechpvevs
Kaiku Tone	ycdbqhroto
Kaiku Tone (passive)	xcdcqgsnuo
Kaiku Tone (wireless)	ycdbqhroto
KBEAR Believe	vkfglpjmjj
KBEAR Diamond	clffnpogpi
KBEar F1	rjjelmnjos
KBEAR KB02	eojimlimmi
KBEAR KB04	jlggnrikcl
KBEAR KS1	recenplmlm
KBEAR KS2	bmgfpqijhl
KBEAR Lark	qlggmplhcg
KBEAR Neon	wkihjlisus
KBEAR Qinglong	iliirodhvt
KBEAR Robin	hkeenqionr
KBEAR Rosefinch	9ledmpnpnk
KBEAR Stellar	tpigliqkch
KBEAR Storm	ijfgpsihnm
KEF M200	bmhgonfsqd
KEF M500	mkfgkmqivn
KEFINE Delci	gmihnkknji
KEFINE Delci AE (ANC off, gold nozzle)	hmiinlhofk
KEFINE Delci AE (ANC off, silver nozzle)	fmhhmkmogj
KEFINE Delci AE (gold nozzle)	glghnmiqek
KEFINE Delci AE (silver nozzle)	elggmlmqhj
Kefine Klanar	emihpkdwgg
KEFINE Klean	lkiinlimmh
KEFINE Klean (ANC off, black nozzle)	imjinmhlij
KEFINE Klean (ANC off, silver nozzle)	hmihmlklki
KEFINE Klean (black filter)	injinmfmmj
KEFINE Klean (silver filter)	gniinkjmoi
KEFINE Quatio (black nozzle)	fmhimljpmm
KEFINE Quatio (gold nozzle)	imijnjhojm
KEFINE Quatio (silver nozzle)	hmijmkjokm
Kennerton Jimo	fjbahsurls
Kennerton Magister	rk7kpgudpo
Kennerton Odin Bog Oak	xmhhjgrksm
Kennerton Thror Bog Oak	xjhglhqjuk
KFA2 SONAR-04	kgf7httq7j
KiiBOOM Allure	jlhinneqpm
KiiBOOM Evoke	imijmkjnol
Kinera Baldr	piiksmajpp
Kinera BD005	6mfeoolmxq
Kinera BD005 Pro	okihmmgnlm
Kinera Celest Gumiho	klhiolcyjj
Kinera Celest Pandamon	rlhhlnfrro
Kinera Celest Pandamon 2.0	vjghnldttq
Kinera Celest Phoenixcall	qgegsjhpod
Kinera Celest Plutus Beast	imijpmcosq
Kinera Celest Relentless	jjhiplfqf6
Kinera Celest Rue	gkddlqlsrs
Kinera Celest Wyvern	hmjhmkgsxp
Kinera Celest Wyvern Abyss	kljjnmflui
Kinera Celest Wyvern Pro	jnkjnlflti
Kinera Celest Wyvern Qing	mkijnmekvn
Kinera Celest Yaksha	jkhhnmhqrm
Kinera Freya	wifhqocltq
Kinera Freya 2.0	nlhiokiljr
Kinera H3	mkijsfjm0o
Kinera Hodur	niefmpgspm
Kinera IDUN	tkhgpiiqmm
Kinera IDUN Deluxe	vigglgppnq
Kinera Imperial Loki	injkqhdqja
Kinera Imperial Loki Emerald	emijqigppb
Kinera Imperial Nanna	lnkinkgnja
Kinera Imperial Odin	okffpodvij
Kinera Imperial URD	gnjhlkmnpl
Kinera Nanna	injhmkioid
Kinera Nanna 2.0	gmihnlgtqf
Kinera Norn	llhhsqajpj
Kinera Odin	sjgfokfwnr
Kinera SEED	xneemnngvt
Kinera SIF	mjecmskpeg
Kinera Skuld	ujhgmjjrvo
Kinera Tyr	8mhgorhjhs
Kinera Verdandi	lkjkqidlpl
Kingsound KS-H04	xhijlaqpsh
Kitsound Mini	3lb9isutis
Kiwi Ears Aether	jmhhmkguhg
Kiwi Ears Airoso	jlhhmlknmg
Kiwi Ears Ardor (ANC off)	fjkgpgmpcn
Kiwi Ears Ardor (ANC on)	ehllmjincn
Kiwi Ears Astral	kjjjkkjqpc
Kiwi Ears Atheia	ne4pshfvrn
Kiwi Ears Aventus (ANC off, double foam)	fkbmjjthoj
Kiwi Ears Aventus (ANC off, thick foam)	hkcljkshpk
Kiwi Ears Aventus (ANC off, thin foam)	hkcljkthjm
Kiwi Ears Aventus (ANC off)	ukjgflpoin
Kiwi Ears Aventus (ANC on, double foam)	lkenjjpgmk
Kiwi Ears Aventus (ANC on, thick foam)	mkenljogln
Kiwi Ears Aventus (ANC on, thin foam)	mjdmllnhhm
Kiwi Ears Aventus (ANC on)	jmgqhkkneo
Kiwi Ears Aventus (passive, double foam)	gj9mkkugpk
Kiwi Ears Aventus (passive, thick foam)	hjamjlshpk
Kiwi Ears Aventus (passive, thin foam)	gjamkkthkm
Kiwi Ears Cadenza	hmihmmjmoj
Kiwi Ears Canta	gmhhnnilob
Kiwi Ears Division	jg1ntktdj9
Kiwi Ears Dolce	llggnokioa
Kiwi Ears Ellipse	oncakmsujr
Kiwi Ears Etude	gnggrhitnj
Kiwi Ears Forteza	glijqmelek
Kiwi Ears KE4	fkijjlmlpb
Kiwi Ears Melody	kjffomjrl9
Kiwi Ears Orchestra	plihklhski
Kiwi Ears Orchestra Lite	nkhkljhrnj
Kiwi Ears Orchestra Lite (CIEM)	pjhlnhgnxo
Kiwi Ears Quartet (off-off)	lkefnmmrje
Kiwi Ears Quartet (off-on)	nkfhomhqmf
Kiwi Ears Quartet (on-off)	jjdemlnumg
Kiwi Ears Quartet (on-on)	lkegnljupi
Kiwi Ears Quintet	hnjjmljmjf
Kiwi Ears Septet	kiihkkmqfd
Kiwi Ears Singolo	jjimikmjqm
Kiwi Ears x Crinacle Singolo	fliljkmkrj
Kiwi Ears x HBB Punch	bkhhklnopg
KLH Ultimate One	lieapwijkj
Klipsch Heritage HP-3	uggfimpnhg
Klipsch Image One	vnhhnofknj
Klipsch Image One B	fifatthiwp
Klipsch Image S2	ikggonjmit
Klipsch Image S4	ikdckpqopn
Klipsch Image S4i	hkdcloqplm
Klipsch Mode M40	qgjinfhwxu
Klipsch R6 II	ekdclpnspq
Klipsch Reference On Ear	kjgegnvlpm
Klipsch Reference ONE	lhecspimuq
Klipsch S4	elebjprqfi
Klipsch T5 II True Wireless ANC	kjffpplgni
Klipsch T5 II True Wireless Sport	epkhpk9Aen
Klipsch T5 True Wireless	unqdlldwgn
Klipsch X-10i	plgfkmlssq
Klipsch X10	pkgfjlmstr
Klipsch X12i	pkgejmosum
Klipsch X20i	pkgfjmkurl
Klipsch X6i	tkhgjllqnp
Klipsch XR8i	elgflmmrws
Kojo Technology KJB-01 Keyagu	ngccmvqaot
Kontinum Ulim	mpmilljglj
Koss BT540i (wired)	tcectqjkwd
Koss BT540i (wireless)	ggedtokjuh
Koss ESP950	vnjjmemnmi
Koss ESP950 (sample 1)	vnjjmemmmj
Koss ESP950 (sample 2)	vmkjmenoli
Koss ESP95X	vliklcnqnn
Koss ESP95X (Vesper earpads)	wljjkglpph
Koss KDE250	vlsoms2eka
Koss KEB90	1nedmmtmck
Koss KPH30i	xkdimmhomn
Koss KPH30i (Grado G Cushion earpads)	vkcgnmpi9f
Koss KPH30i (Grado GS1000 earpads)	vjbhnnmkch
Koss KPH40	yfchmmjpms
Koss KPH7	wmu8mpdntm
Koss KSC75	uohinnflgi
Koss KSC75 (Venture Electronics earpads)	wnfinoflnl
Koss KSC75X (Yaxi earpads)	vnehmnkikf
Koss Porta Pro	xddhmllnss
Koss Porta Pro (Dekoni earpads)	yhdglmjsso
Koss Porta Pro (sample 1)	ygbhnmjnsj
Koss Porta Pro (sample 2)	ygbhnnkksn
Koss Porta Pro (Yaxi earpads)	wgchmmphjm
Koss Porta Pro Aniv Ed	ygbhnmjnsj
Koss Porta Pro KTC	xechmnionq
Koss Porta Pro Wireless	vddgmmkqnt
Koss PRO DJ 100	rodlmklikl
Koss Pro4AA 1975	xol8lvatxm
Koss Pro4AA 2014	wluoas6mvk
Koss Pro4AAA	vgdbktmkup
Koss Pro4S	rehshlgjzo
Koss QZPro	Bb9hkdvxro
Koss SP330	ijfliksfrm
Koss SP540	mkcfnpohon
Koss SportaPro	wjejnnmcqk
Koss Tony Bennett	xhgfgmqpvl
Koss UR 20	qjghdkxm8n
Koss UR 29	xnjkkhgtoj
Kotori Vampire	mkfejnpqor
Kotori Zephyr	plggmhnonm
KRK SYSTEMS KNS 6400	vokijohlqg
KRK SYSTEMS KNS 8400	vqagtphfqi
Ks Earphone K64	umjnuk3mfl
Kumitate Lab KL-Corona	vhfhlnhqnt
Kumitate Lab KL-Focus (max bass)	jkghokioip
Kumitate Lab KL-Focus (min bass)	unlkmigmgn
Kumitate Lab KL-Focus (setting 2)	qljjnigmgo
Kumitate Lab KL-Focus (setting 3)	mlijojhnho
Kumitate Lab KL-Kanon 6-Minus	tmpjklicev
Kumitate Lab KL-Kanon 6-Plus	llecitrefv
Kumitate Lab KL-Meteo	fkejthgqps
Kumitate Lab KL-REF Type-S	qmjhkjkpnu
Kumitate Lab KL-REF Type-S (half bass)	kmihkjkpot
Kumitate Lab KL-REF Type-S (max bass)	blefmlmrqt
Kumitate Lab KL-Sanka	pkfdhlstot
Kumitate Lab KL-Sanka B	hjehloksae
Kumitate Lab KL-Sanka K	kkcdmpnq8f
Kumitate Lab KL-Sirius	vkihlhlont
Kumitate Lab KL-Sirius (CIEM)	wkiilhjrro
Kumitate Lab Trio (half)	klggqs9rca
Kumitate Lab Trio (max)	mlhiru5o96
Kumitate Lab Trio (min)	hlfeoofwli
KZ AS06	hkddlrokgo
KZ AS10	jjeforhliq
KZ AS16	tkijsiaqmk
KZ ASF	ikffsqcnqu
KZ AST	ikeeqpgoou
KZ ASX	kkffspcopu
KZ ATE	khdfnqohki
KZ BA10	okggmqijio
KZ Carol	jickhoooib
KZ Carol (ANC off)	pgdkjmnlid
KZ Carol (ANC on)	ofelllpii9
KZ Carol Pro (ANC off)	nhcnjmnjke
KZ Carol Pro (ANC on)	jhcjiopkjd
KZ Castor (off-off-off-off)	agajqojolh
KZ Castor (off-off-on-off)	bgalpnjnlh
KZ Castor (off-off-on-on)	bgbnnnjnkh
KZ Castor (on-n-off-off)	dhakqmmjih
KZ Castor (on-off-off-off)	9hbjqojolh
KZ Castor (on-off-on-off)	ahbloniolg
KZ Castor (on-on-off-off)	7hbkpojolh
KZ Castor (on-on-on-off)	8hcmoniolg
KZ Castor (on-on-on-on)	8hdomninlg
KZ Castor Improved Bass Version (off-off-off-on)	qgdpmkjjig
KZ Castor Improved Bass Version (off-off-on-off)	ogcmolkjjg
KZ Castor Improved Bass Version (off-off-on-on)	qgeolkikif
KZ Castor Improved Bass Version (off-on-on-on)	mifplkjjif
KZ Castor Improved Bass Version (on-off-off-off)	khbkqmkjjh
KZ Castor Improved Bass Version (on-on-off-off)	ihckqlkjjh
KZ Castor Improved Bass Version (on-on-on-on)	lifplkjjif
KZ D-FI (off-off-off-off)	kmkjmliipi
KZ D-FI (off-off-off-on)	qlhhlmjnqk
KZ D-FI (on-off-off-off)	mmjimmiipi
KZ D-FI (on-off-off-on)	nmjimmiipi
KZ D-FI (on-off-on-off)	mmjimmiipi
KZ D-FI (on-off-on-on)	lmjimmiipi
KZ D-FI (on-on-off-off)	lmkjmmiipi
KZ D-FI (on-on-off-on)	lnkimmiipi
KZ D-FI (on-on-on-off)	omjimmiipi
KZ D-FI (on-on-on-on)	pliimmiiqi
KZ DQ6	okggnneter
KZ DQ6S	flggnkjsno
KZ E10	skilmqbjrn
KZ ED Special Edition	9mgforoadk
KZ ED16	flgfoodwoe
KZ ED9 (balanced filter)	ameenqoeuq
KZ EDC Pro	hjghnnjooj
KZ EDR1	7mgfnrlhgo
KZ EDSE	7ngfnqqe9g
KZ EDX Pro	hkffnqfppk
KZ EDX Ultra	elggnnklni
KZ EDXS	fnjinmihmq
KZ ES4	fkghosdlzj
KZ ESX	glggnnhppn
KZ Krila	nkjjnlhmpe
KZ Lin Long	cpjhnlhnnn
KZ PR1	hkggnqfqn7
KZ PR1 Pro	glhhnmhqi6
KZ PR2	fojinmfloc
KZ PR3	kmkjnmdnj6
KZ PRX	hlihnljnlb
KZ S2	tgeemqofho
KZ S4	6ohfoslalu
KZ Saga	jiggnnmlng
KZ SK10	cigelrrccq
KZ SKS	gehfmqpbpr
KZ Sonata (off-off-off-off)	wkehmngqsf
KZ Sonata (off-off-on-on)	wkehmnhqsh
KZ Sonata (on-on-off-off)	pidjnngqsf
KZ Sonata (on-on-on-on)	pidjnnhqsh
KZ Symphony	ogcosmcnh5
KZ Vader Balanced (off-off-off-off)	mhejnmjpmf
KZ Vader Balanced (off-off-off-on)	qhimkkinjd
KZ Vader Balanced (off-off-on-off)	ohgllliole
KZ Vader Balanced (off-on-off-off)	hifkmliole
KZ Vader Balanced (off-on-on-off)	jjhllkinke
KZ Vader Balanced (on-off-off-off)	lifjmljome
KZ Vader Balanced (on-off-off-on)	ojimkkinjd
KZ Vader Balanced (on-on-off-off)	hjfkmliole
KZ Vader Balanced (on-on-on-off)	jjhmlliole
KZ Vader Balanced (on-on-on-on)	ljjnkkhnkd
KZ VXS	emckmkomlh
KZ VXS Pro	iignknjiie
KZ x Crinacle CRN	jnjhlkknop
KZ x HBB PR2	eojinnhknh
KZ x HBB PR2 (with black mesh)	gokjnngine
KZ x HBB PR2 (without black mesh)	gokjnmfmj7
KZ Xtra	hlekinrggj
KZ Xtra (ANC off)	leenjojmij
KZ Xtra (ANC on)	ljemimphgi
KZ Z10 Pro 2	hliinmhokc
KZ ZA12 (off-off-off-off)	ujhkomgjja
KZ ZA12 (off-off-on-off)	ukhkomfiia
KZ ZA12 (off-off-on-on)	ukhkomfhh9
KZ ZA12 (on-off-off-off)	rkijomgjjb
KZ ZA12 (on-on-off-off)	pkhjomgjja
KZ ZA12 (on-on-on-on)	qkikomfih8
KZ ZAS	emggoocvlq
KZ ZAX	mkggnqepok
KZ Zenith (ANC off)	llhhmlhrpn
KZ Zenith (on-on-off-off)	mliimmfssj
KZ ZES	9nhgnimsdl
KZ ZEX	sifdnnhtml
KZ ZEX Pro	kmjiljnlkn
KZ ZS10	llggoofnnp
KZ ZS10 Pro	mkggnqfnol
KZ ZS10 Pro 2 (off-off-off-off)	rmjillilja
KZ ZS10 Pro 2 (off-off-off-on)	rmjillilja
KZ ZS10 Pro 2 (on-off-off-off)	onkillilja
KZ ZS10 Pro 2 (on-on-off-off)	lnkjllilia
KZ ZS10 Pro 2 (on-on-on-off)	fniimmjmkb
KZ ZS10 Pro 2 (on-on-on-on)	gnihmmjmjb
KZ ZS10 Pro X	hlggnohpmi
KZ ZS12 PRO X	hmihnminhb
KZ ZS3	fkddlrojpp
KZ ZS4	8leensogob
KZ ZS5v1	njfgmrbvti
KZ ZS5v2	liefnrdxm5
KZ ZS6	ljffmqhsr8
KZ ZS7	cmggppfppl
KZ ZSE	blednqqemn
KZ ZSN	mjghpqemqj
KZ ZSN Pro	mjfgoqfllh
KZ ZSN Pro X	lkfgnqgnif
KZ ZSR	miefmniyi8
KZ ZST	kkhhooerhi
KZ ZSX	mjggnqensi
KZ ZVX	gmihnmimmi
Lafitear LM1	midclqopaa
Lafitear LM2	jidclromkf
LAMAX HighComfort ANC (ANC off)	whegmmkpgi
LAMAX HighComfort ANC (ANC on)	sdghomilmp
Lark Studio LSX	mjedlmlwlv
Lear LCM BD4.2	umkkmngfmu
Lear LUF 4C	qjgmonbofi
Lear LUF-4F	rjfmomdomi
Lear NS-U1 (all Off)	vlqrok5avr
Lear NS-U1 (NS on)	bmheiCgczt
Lenntek Pro Series	wnljmjemvs
Lenntek Sonix 3 Headset	unmkljfirr
Lenovo Thinkplus XT98	lebiqnjmit
LG Quadbeat HSS-F420	plgfknoopi
LG Tone Free	jqmjgilrsi
LG Tone Ultra (ANC off)	iggkkkpiml
LG Tone Ultra (ANC on)	tdelkkpiml
LH Labs Verb	jlghoqn6jp
Libratone Track Air Plus	dppkfkjopn
Life Acoustics PreKickstarter	qkgeikpsop
Light Harmonic Mera	gjfepnmjiu
Light Harmonic Stella	mkeclmmxod
Lime Ears Aether	rlhgljjuns
Lime Ears Aether (bass)	fmhgnjjuot
Lime Ears Aether R	xjggpn9xmm
Lime Ears Aether R (bass)	thfeppbxon
Lime Ears Incognita	kkiimkipoo
Lime Ears LE2	tlhfjmgxqq
Lime Ears Maris	kkgjmkgwmg
Lime Ears Model X (switch off)	uligjmjnil
Lime Ears Model X (switch on)	qkfdinormo
Lime Ears Terra	imjimkjmij
Lindy HF-100	vkalrimepq
Linsoul BLD	Amddffvwvu
Linsoul Lokahi	kkeklmhpnh
Lioncast X55	khckjhrqkm
Little Dot GYFU	qikkjjnhko
Logitech G PRO 2 (fabric earpads)	rdptkdfmlg
Logitech G PRO 2 (leather earpads)	hejkkhltok
Logitech G Pro Gaming Headset	mkbionlnie
Logitech G Pro X	lq6hpkjuqs
Logitech G Pro X (3.5mm jack)	rkahtm9xor
Logitech G Pro X (USB)	hh8jwq6uhl
Logitech G PRO X 2 LIGHTSPEED	gffoiiookq
Logitech G PRO X 2 LIGHTSPEED (fabric earpads)	odoqmdgmlg
Logitech G PRO X 2 LIGHTSPEED (leather earpads)	hejkkhltok
Logitech G Pro X Gaming Headset	qlchnmhuio
Logitech G PRO X LIGHTSPEED	thgnnp9nij
Logitech G333	hibcnnrpng
Logitech G335	uifqrjcjbq
Logitech G430	ndfhphmpgn
Logitech G431	goc8mkxqil
Logitech G432	tmiiijlpgi
Logitech G433	ljbirhkuoe
Logitech G435 LIGHTSPEED	udihopempj
Logitech G533	kkiflnojhc
Logitech G535 LIGHTSPEED	tedlqkhnkk
Logitech G635	kjigmmnjfl
Logitech G733 LIGHTSPEED	qkhjkrenlk
Logitech G735	hehdqljufj
Logitech G930	nlcmminliu
Logitech G933	ggfkqjpfjc
Logitech G933s	jqc8rmopnt
Logitech G935	lgejomkkhl
Logitech UE 6000 passive	gkhhncspro
Logitech UE 900	tligcnlxqh
Logitech UE 9000	liggnfqpso
Logitech UE4000 2012	kjefoavtws
Logitech Zone Vibe 100	ocjgrjevki
Logitech Zone Wired	redhqnjlni
LucidSound LS31	uadcoiqvfj
Ludos Clamor	sihdjotbht
Lypertek Bevi	ukihjkmoon
Lypertek PurePlay Z3 1.0	cqlimndomh
Lypertek PurePlay Z3 2.0	iokhlocsrk
Lypertek PurePlay Z7	hlgjsjeoys
Lypertek Tevi	gplimodpsl
LZ Hi-Fi Audio A2 Pro	gkggoqaxql
LZ Hi-Fi Audio A4 Pro (black nozzle, black vent)	tjijnnboyl
LZ Hi-Fi Audio A4 Pro (black nozzle, blue vent)	xnkimnboyk
LZ Hi-Fi Audio A4 Pro (black nozzle, red vent)	nlijonbpxl
LZ Hi-Fi Audio A4 Pro (blue nozzle, black vent)	tkjkoo8oyl
LZ Hi-Fi Audio A4 Pro (blue nozzle, blue vent)	wlkinmapuh
LZ Hi-Fi Audio A4 Pro (blue nozzle, red vent)	gnjjpmaruh
LZ Hi-Fi Audio A4 Pro (gold nozzle, black vent)	qkijomcovi
LZ Hi-Fi Audio A4 Pro (gold nozzle, blue vent)	wlkiolarwh
LZ Hi-Fi Audio A4 Pro (gold nozzle, red vent)	gnjjpkbsvi
LZ Hi-Fi Audio A4 Pro (red nozzle, black vent)	jjgfkmoptk
LZ Hi-Fi Audio A4 Pro (red nozzle, blue vent)	mkhhjjorof
LZ Hi-Fi Audio A4 Pro (red nozzle, red vent)	6nfeknqsoh
LZ Hi-Fi Audio A4 Pro (silver nozzle, black vent)	tkjjon9qym
LZ Hi-Fi Audio A6 (black nozzle)	dplkqmaph6
LZ Hi-Fi Audio A6 (blue nozzle)	eplkqm8qh6
LZ Hi-Fi Audio A6 (dark blue nozzle)	dpljrfcxl6
LZ Hi-Fi Audio A6 (grey nozzle)	dokjpkausd
LZ Hi-Fi Audio A6 (pink nozzle)	9pihmljtg5
LZ Hi-Fi Audio A6 (purple nozzle)	8oigmlkui3
LZ Hi-Fi Audio A6 (red nozzle)	8pigmmjsh7
LZ Hi-Fi Audio A6 (silver nozzle)	cpkjqgewk5
LZ Hi-Fi Audio A6 (yellow nozzle)	eplkrk8si5
LZ Hi-Fi Audio A6 Mini (black nozzle)	cpkkpn8oyl
LZ Hi-Fi Audio A6 Mini (blue nozzle)	dplkqo6oyl
LZ Hi-Fi Audio A6 Mini (red nozzle)	6piglmkssj
LZ Hi-Fi Audio A7 (monitor, black nozzle)	lmkimkevok
LZ Hi-Fi Audio A7 (monitor, blue nozzle)	lnkjnlawoj
LZ Hi-Fi Audio A7 (monitor, gold nozzle)	knjhmigwpj
LZ Hi-Fi Audio A7 (monitor, red nozzle)	hmigkinsnl
LZ Hi-Fi Audio A7 (monitor, silver nozzle)	lnkjnlavok
LZ Hi-Fi Audio A7 (pop, black nozzle)	fmjjpmcslg
LZ Hi-Fi Audio A7 (pop, blue nozzle)	gnjjpn8tmf
LZ Hi-Fi Audio A7 (pop, gold nozzle)	fmiiokeumf
LZ Hi-Fi Audio A7 (pop, red nozzle)	cmhgnklokh
LZ Hi-Fi Audio A7 (pop, silver nozzle)	gmjjpo8rmg
LZ Hi-Fi Audio Z04A	jlhgoocupk
LZ Hi-Fi Audio Z05A	rljjohetsr
Mackie MC-250	tdgiselphk
Mackie MP-360	skgeigqxlk
Madoo Type 711	elfhskhmjk
Magaosi K3	rjfdilpwkr
Magaosi K3 (cross filter)	qjfdilpxlr
Magaosi K3 (harsh filter)	qjfdikoxkq
Magaosi K3 (no filter)	qjfdiknxkq
Magaosi K5	rjgflnhwjo
Magaosi K5 (15 ohm adapter, IEMatch, high)	sjgeklkwgo
Magaosi K5 (15 ohm adapter, iFi IEMatch, ultra)	tjgflmivgm
Magaosi V3	ijffnlnqik
Mangird MT4	llhhojiqql
Mangird Tea	onljijhrvm
Mark Levinson No 5909	gqhllimlke
Marshall Major	vmoioi7vgh
Marshall Major II	llhmhfoumn
Marshall Major III	uhjnsfk7pb
Marshall MID ANC	ljhkolleha
Massdrop + Grell OAE1 Signature	fjhennqcAk
Massdrop Nobel X	pkgejlosmp
Massdrop Panda	vjchijumnq
Massdrop Panda (active)	lldeoksipq
Massdrop Panda (passive)	lldfokrhpq
Massdrop Plus Universal IEM	olghnogmpq
Massdrop x Noble X Universal IEMs	pkfdkmnsor
Master & Dynamic ME05	iiefnoohqp
Master & Dynamic MH30	ijfhijrpxq
Master & Dynamic MH40	r9fjlfqrhk
Master & Dynamic MW07	jjddlpufgs
Master & Dynamic MW07 Go	9mfdmrqdqs
Master & Dynamic MW07 Plus	5nfdmqtbks
Master & Dynamic MW08	iiaeomsngi
Maximo iMetal iM-590	enhhnmfwfm
Maximo iMetal iM-590 White	enhhnmfwfm
Maximo iMetal iP-HS5	enhhnmfwfm
Mayflower Electronics T50RP Version 2	tpgfrqhbmh
Meccaudio ME04	tjgflepvrq
Meccaudio ME20	lmjhlmbyun
MEE Audio A161P	tligjljriu
MEE Audio Air-Fi Matrix2 AF62 (wired)	tbiihisnpm
MEE Audio Air-Fi Matrix2 AF62 (wireless)	vbiiiiqmml
MEE Audio M6 Pro	nkhiqok9hn
MEE Audio M6 Pro 2nd Generation	amgfnnnhtj
MEE Audio M9B	0nigqlsf9c
MEE Audio Planamic	oieemtkgzn
MEE Audio Sport-Fi M6	5nfeqqt3qv
MEE Audio X6 Plus	fljjrljahm
MEE Audio X7	thfhpnq2qj
Meizu Live (black filter)	qfcdloosti
Meizu Live (blue filter)	tfcdlpoqvi
Meizu Live (white filter)	pgcdlnossi
Metal Magic Research Homunculus	tjggmqeorr
Metal Magic Research Thummim	ljedlvfqpo
Meyer Audio SLIIVO SLT6 (off-off)	jmiinhlolf
Meyer Audio SLIIVO SLT6 (off-on)	kmiknflomg
Meyer Audio SLIIVO SLT6 (on-off)	hmhinhlolf
Meyer Audio SLIIVO SLT6 (on-on)	imijnflomf
Meze 105 Aer	rhghljsenk
Meze 109 Pro	sifhkjtilg
Meze 109 Pro (ZMF Acoustic Titan Mesh)	qjfhkkrlnl
Meze 11 Deco	bkcbjroxmr
Meze 11 Neo	vgeekolovo
Meze 12 Classics	vifekrnfns
Meze 12 Classics V2	uhddirsglt
Meze 66 Classics	jhe7lnxmxq
Meze 88 Classics	qjhds9nxur
Meze 99 Classics	gidcqmnofm
Meze 99 Classics (Brainwavz memory foam hybrid earpads)	kheppijg8h
Meze 99 Neo	iic9sjrrhm
Meze 99 Neo (99 Classics earpads)	wkhlnflkpl
Meze 99 Noir	dhb8skssjp
Meze Advar	nkgfklmtge
Meze Alba	mkjimkkkog
Meze Elite (alcantara earpads)	xifglisirh
Meze Elite (hybrid earpads)	tihejjtjtj
Meze Elite (leather earpads)	rkhfcqtksh
Meze Empyrean	wghgldsqph
Meze Empyrean (alcantara earpads)	shghlirisf
Meze Empyrean (leather earpads)	rjgemkpkte
Meze Empyrean 2	pjfgmmtcji
Meze Empyrean 2 (Duo earpads)	sifflooike
Meze Empyrean II (alcantara earpads)	ukhjkhvbgh
Meze Empyrean II (duo earpads)	uhfelosckg
Meze Liric	lhfnlemppg
Meze Liric 2	jigjkjpjmg
Meze Liric II	gkgkliommf
Meze Poet	tjhhlgppqd
Meze Rai Penta	tjhgnmdsrr
Meze Rai Solo	pkfgmpmfBq
Microsoft Surface Earbuds	uniehlonhj
Microsoft Surface Headphones	kgdenqitqj
Microsoft Surface Headphones 2	q98kpimtjm
Microsoft Xbox Wireless Headset	bg1btsqonk
MiM Audio Dark Magician	tkihkliptn
MiM Audio Dark Magician (revised)	mmiglmipmm
Mixcder E9	ikjgjeyiih
MMR Gae Bolg	okfelpgxiq
MMR Homunculus	tkgfmgjxsp
MMR Thummim	okfdjmoqql
Modhouse Audio Argon Mk3 (ZMF oval pleather earpads)	sc7doksqsk
Modhouse Audio T60RP Argon (Xenon suede earpads, baffle upgrade)	ql8jnevnmf
Modhouse Audio T60RP Argon (Xenon suede earpads)	nl7iodxmij
Modhouse Audio Tungsten (hybrid earpads)	skhhikolqk
Modhouse Audio Tungsten (perforated earpads)	vhiimhojpi
Modhouse Audio Tungsten Double Sided (ZMF Caldera hybrid earpads)	rkhhilmqlh
Modhouse Audio Tungsten Double Sided (ZMF Caldera Ultra-Perf earpads)	tiijmhlole
Modhouse Audio Tungsten Single Sided (ZMF Caldera Hybrid earpads)	slhijllpic
Modhouse Audio Tungsten Single Sided (ZMF Caldera Ultra-Perf earpads)	ujiinhlnia
Moe Audio SS01	jkffmnpglp
Mofasest M14 (off-off)	llijoigqnj
Mofasest M14 (off-on)	nljioifqoj
Mofasest M14 (on-off)	ikghojhspk
Mofasest M14 (on-on)	jlhhojhrpl
Monoprice 110010	sgehhmpsom
Monoprice 8320	vmpkkmahvr
Monoprice 8323	xfhkldkxkj
Monoprice M1060	vjijmkjgvl
Monoprice M1570	qkigkcwknl
Monoprice M1570 (leather earpads)	tjjhlcsnnm
Monoprice M1570 (velour earpads)	wkijmfnknk
Monoprice M1570C (leather earpads)	skgjrjfjqm
Monoprice M1570C (velours earpads)	umllnighnj
Monoprice M350	wmkjk6pAma
Monoprice M650	mieahvmrjq
Monoprice Modern Retro	cfdeplosms
Monoprice Modern Retro (Dekoni elite hybrid earpads)	kegprlgaci
Monoprice Monolith M-TWE	jchhinoohi
Monoprice Quartet	qkgfkniwld
Monster Clarity 101 AirLinks	8lqbgokxle
Monster DNA Pro2	sfiklmncxk
Monster Inspiration	nhdivhlfxr
Monster Jamz	dmhgnohntm
Monster Lil Jamz	emgflnlouo
Monster Miles Davis Tribute	dmggnphntk
Monster Solo	kg9crjwhys
Monster Turbine	amggoplgui
Monster Turbine Pro	gkddmqnoxs
Monster Turbine Pro Copper	glgflnmmum
Monster Turbine Pro Gold	elffnpkmtl
Montblanc MB 01 (wired, ANC off)	lnbdjnnytv
Montblanc MB 01 (wireless, ANC)	moecilnzvu
Moondrop A8	riekplhktj
Moondrop Alice (default EQ)	dnkhllmkhj
Moondrop Aria	klhhnlkmof
Moondrop Aria (2021)	nkiimmgntj
Moondrop Aria 2	okghnnilrk
Moondrop Aria Elven Maiden	lkhhmlkkth
Moondrop Aria Snow Edition	tjhimmhltl
Moondrop Blessing	pmkilmhjqj
Moondrop Blessing 2	qljimlgnni
Moondrop Blessing 3	gnmkoijfkj
Moondrop BLOCK	umpikljgkl
Moondrop Chu	mnjimliknj
Moondrop Chu 2	lkhhnoiksi
Moondrop Concerto	qfkjjkjorf
Moondrop Cosmo	ukjjkflssc
Moondrop Crescent	jjhimjmmqh
Moondrop Darksaber	nlkkmjhmqh
Moondrop Droplet	hihkjohptm
Moondrop Edge (ANC on, reference)	gpkglkhrur
Moondrop Golden Ages (basshead)	esokijiksl
Moondrop Golden Ages (monitor eq)	qnnliiikso
Moondrop Golden Ages (monitor)	oonlijiksl
Moondrop Golden Ages (reference)	jrkjkkjlum
Moondrop Golden Ages (secret)	ilhlflomuo
Moondrop Harmon	hljlmkhjrj
Moondrop Horizon	xjhhmhlpto
Moondrop Illumination	rkhglokkno
Moondrop ILLUSTRIOUS	wmhhknklon
Moondrop Jiu	nmlkjkjjnj
Moondrop Joker	vkgmpm7sii
Moondrop Kadenz	sjhimmhmrj
Moondrop Kadenz (long nozzle)	okhhmmjmqm
Moondrop Kadenz (medium nozzle)	okhhmmjmqm
Moondrop Kadenz (short nozzle)	okhhmmjmqm
Moondrop Kanas Pro	lkhhmnhlxm
Moondrop KATO	pliiokhlkf
Moondrop Kato (brass nozzle)	okhhmmhoto
Moondrop Kato (gold nozzle)	kmhhnljmnk
Moondrop Kato (silver nozzle)	kmihnlimpk
Moondrop Kato (steel nozzle)	nlhhmmgnsn
Moondrop KXXS	ojhhnnhksl
Moondrop KXXX	lliinliluj
Moondrop LAN	hpkjpjhhin
Moondrop May	jliinmgnve
Moondrop May (3.5 mm)	hmiinmglwg
Moondrop Meteor	olkjlkhoql
Moondrop Meteor (wide bore eartips)	inkiljjoqn
Moondrop Moca (ANC off, reference)	ujikilklmj
Moondrop MOCA (ANC off, standard EQ)	rlhkjljlon
Moondrop Moca (ANC on, reference)	rljmekmlki
Moondrop MOCA (ANC on, standard EQ)	lmimglmkoo
Moondrop Moca (reference)	rlijiljqkp
Moondrop Moca (standard)	mmgjilkqlp
Moondrop Nekocake	rkklflmjnt
Moondrop Nekocake (ANC off)	okkkekookr
Moondrop Nekocake (ANC on)	okkkekoolr
Moondrop Para	vjiilkngod
Moondrop Para (fenestrated PU earpads)	vmhjoglkmd
Moondrop Para (hybrid earpads)	wkiilkkiq7
Moondrop Para (ZMF Auteur perforated lambskin earpads)	uliimfqgie
Moondrop Para (ZMF Eikon perforated suede earpads)	vlhilfsgki
Moondrop Para (ZMF Universeperforated suede earpads)	vmhjmfrfje
Moondrop Para II	vkkjlempne
Moondrop Pavane (donut foams)	vlsiijmass
Moondrop Pavane (no foamd)	tlrojmh6io
Moondrop Pavane (white foams)	vmrgikobts
Moondrop Quark 2	lokjmlhkol
Moondrop Quarks	plggmphlqn
Moondrop Quarks DSP	kkklllgmji
Moondrop Rays	okgijmllsl
Moondrop Rays (analog)	emihnmjmtg
Moondrop S8	nkjjlmgmsg
Moondrop Solis	vjgfknkprk
Moondrop Solis 2	jnjhllmlkj
Moondrop Space Travel	qkikkmjish
Moondrop Space Travel (basshead mode)	imkkklkhpf
Moondrop Space Travel (monitor mode)	tnkijjlipf
Moondrop Space Travel (reference mode)	omjkklkhrh
Moondrop Space Travel 2	qmjijkkprq
Moondrop Space Travel 2 (ANC off)	qmjiikkqpp
Moondrop Space Travel 2 (ANC on)	qmkjkkkjvj
Moondrop Spaceship	vjfhmpihqj
Moondrop Sparks	olkkinkhnk
Moondrop SSP	sjggnqigrk
Moondrop SSR	tnlimohdli
Moondrop SSR (Ostry 0S100 eartips)	uifgmpodll
Moondrop SSR (Ostry 0S200 eartips)	uifgmpncpo
Moondrop SSR (Ostry 0S300 eartips)	uifgmpncqo
Moondrop Stardust	ukgflooghg
Moondrop Starfield	mlhinlhmsj
Moondrop Starfield 2	pighnojiqi
Moondrop Starfield 2 (bass plug)	klggnolhlh
Moondrop Starfield 2 (gray foam dampers)	jmhhnnjioi
Moondrop Starfield 2 (Spinfit CP-145 eartips)	npjikjmlmo
Moondrop Starfield 2 (tuning mesh 500)	jmhhnmkjrf
Moondrop Stellaris	iojkpkbpfg
Moondrop U-2	tlqelloacg
Moondrop U2 (foams)	uolbjjuhlo
Moondrop Ultrasonic (ANC on, reference)	tjjlkimjng
Moondrop Ultrasonic (reference EQ)	ukjljimhrj
Moondrop Variations	flimmkikpj
Moondrop Venus	vijhjknkmf
Moondrop Void	ugfglmlprl
Moondrop Void (Poyatu hybrid perforated fabric earpads)	sfghnkmjnl
Moondrop Voyager	hnjhmlinnj
Moondrop x Crinacle Blessing2 Dusk	jmijmjklkh
Moondrop x Crinacle DUSK	bnljpgjlkl
Moondrop x Crinacle DUSK (analog)	dpmknhikji
Moondrop x Crinacle DUSK (Bass+ DSP)	9khjknkntg
Moondrop x Crinacle DUSK (Default DSP)	iljijnjosg
Moondrop x Crinacle DUSK (Diffuse-tilted DSP)	jukgjnjkri
Moondrop x Crinacle DUSK (Harman DSP)	hmjkllkini
Moondrop x Crinacle DUSK (V DSP)	dljiknkmoe
Moondrop x Singer Edge (ANC off)	6pfdqoirtr
Moondrop x Singer Edge (ANC on)	ampaqmdsqq
Moritz Dragon	dpkinljjog
Moritz Paradise	fjhkpjiokj
Moritz Paradise (off-off-off)	ulrnkffjgg
Moritz Paradise (off-off-on)	jkiloiilij
Moritz Paradise (off-on-off)	fjhkpjiokj
Moritz Paradise (off-on-on)	fjfipkknlk
Moritz Paradise (on-off-off)	ejfiplkoll
Moritz Paradise (on-off-on)	eiehpllpml
Moritz Paradise (on-on-off)	ejfiplkoll
Moritz Paradise (on-on-on)	didgpmlqnm
Motorola Moto Buds Plus	eojkhplhnj
Motorola Moto Buds Plus (ANC on)	gnjiirkgnf
Motorola Squads 200	vmrhqfellu
Mpow 059	mjd8uqjmtj
Mpow CH1	tlqlr3jr8q
Mpow CH6	qnlikaowkl
Mpow CH9	gjbepdxr6d
Mpow EM12	8lecooqmbv
Mpow Flame Pro	hgcfllppwm
Mpow H10	kheforkk2c
Mpow H5	ugecmuhokc
Mpow HC6	xpg8iomwuo
Mpow Jaws (4.1)	ekbblltusr
Mpow M30	bnhgokksfe
Mpow MDots	dkdfplkvje
Mpow Pro Trucker	zlxjf6izvq
Mpow X3	iikjoljdtq
Mpow X5	kjfdosndsm
Mpow X6	0ohfrondok
MUNITIO Billets	5kb9jtxjhx
MUNITIO Bullet In-Ear	ckeenrmlhu
MUNITIO Pro40	nee6qltqwq
Muse HiFi Power	njhinpfiug
Music Hall Audio DeBe	xhhcjftssu
Musical Fidelity MF100	ngklojlehi
Musical Fidelity MF200	qegisgqdrn
MYER-AUDIO CKLVX CK2V	dmniiklmnd
MYER-AUDIO CKLVX D41	gniimjkpqd
MYER-AUDIO CKLVX D62	nkiimmgonb
MYER-AUDIO CKLVX SLIIVO SLT6 (off-off)	piikohhpld
MYER-AUDIO CKLVX SLIIVO SLT6 (off-on)	piikohhplb
MYER-AUDIO CKLVX SLIIVO SLT6 (on-off)	nihjohiple
MYER-AUDIO CKLVX SLIIVO SLT6 (on-on)	nihjohiplc
MYER-AUDIO SLIIVO SL224	lnlikklipg
MYER-AUDIO SLIIVO SL41	hlkkjmhokg
MYER-AUDIO SLIIVO SL41 MKII	gnnjjljoif
MYER-AUDIO SLIIVO SLA3	dmmjjljnef
MYER-AUDIO SLIIVO SLT6 (off-off)	jnjjngkolg
MYER-AUDIO SLIIVO SLT6 (off-on)	knjknekomi
MYER-AUDIO SLIIVO SLT6 (on-off)	iniinhlolh
MYER-AUDIO SLIIVO SLT6 (on-on)	jnjknflonh
MySphere 3.2	zhhknkbuxr
MyST IzoPhones-60	vjekmgsfhd
NAD RP18 Bass Light Version	vltofgkeqh
NAD VISO HP50	koffmlnnhq
Nan-6 Nan-6	rkjhjgsjjm
NarMoo B2M	dmhfjkntvl
NarMoo R1M (black ports)	8kdcooverp
NarMoo R1M (gunmetal ports)	dngdknvdrq
NarMoo R1M (silver ports)	kkedknwdrp
NarMoo S1	dkddmtpcvn
NarMoo W1M	flgfhistvp
nb Audio SkeLeTon	whemifpnqq
NCM Bella	flggnmkpfm
ND 001 Nano	ljejhjvjhh
ND Planet	kjghomgous
ND Venus	fmggnlkojg
ND X12	njhiopehpm
Nectar Hive	ujkjkfrhin
Neumann NDH20	flhgkixdpq
Neumann NDH30	qiiikhrhuq
Neusonik direm E3	fnihnpgjpn
Neusonik direm PRO	nkiinpdkpk
NF ACOUS NA1	rjghmojhnm
NF ACOUS NA2+	skggmokhld
NF ACOUS NA2+ (Atmosphere eartips)	skggmokhmi
NF ACOUS NA2+ (Balanced eartips)	skggmojjng
NF ACOUS NA2+ (Final Audio Type E eartips	skggmojkmh
NF ACOUS NA20	gkffoonhce
NF ACOUS NE4 (clear faceplate)	vkijmjftlg
NF ACOUS NE4 (grey faceplate)	skghmjiusn
NF ACOUS NE4 (red faceplate)	kldfvhhtjl
NF ACOUS NE4 (transparent blue faceplate)	vnljljdtkf
NF ACOUS NF2u	skgfmlknus
NF ACOUS NM2	tkhhnpifof
NF ACOUS NM20	ljfgopkgff
NF ACOUS RA05	llmmmidpje
NF ACOUS RA15 (gold nozzle)	phefmmokhh
NF ACOUS RA15 (silver nozzle)	rifgmnmhgh
NF ACOUS RG15	flgiolmijj
NF ACOUS RG15 x Assassin's Creed Mirage	jiffnpnigh
NF Audio NA2	jlggnokkrh
NF Audio NA20	hkffoomicg
NF Audio NM2+	oiggpoigmj
NF Audio RA15 (gold nozzle)	lkffmmojji
NF Audio RA15 (silver nozzle)	okggmomhkh
NF Audio RG15 (analog)	gkffnpnhhh
NF Audio RG15 (USB)	gjgiollilj
NHT Super Buds	alffnohuvr
NiceHCK DB1	plggmqjilk
NiceHCK DB2	jliipmbtoj
NiceHCK DB3	jjeenqjomk
NiceHCK EB2S	Ajgf7hzvwq
NiceHCK EB2S Pro (foams)	tmpkmmfbie
NiceHCK EB2S Pro (no foams)	slppnmaaba
NiceHCK EBX21	tlqkkkjbdk
NiceHCK F1 (black filter)	hlffljotji
NiceHCK F1 (gold filter)	mlhinmcunj
NiceHCK F1 (silver filter)	klghmkhumj
NiceHCK F1 Pro	jlhhnmgshf
NiceHCK Himalaya (black filter)	qkggnphkoj
NiceHCK Himalaya (blue filter)	pkggnmgqul
NiceHCK Himalaya (brass filter)	pkggnoglpk
NiceHCK Himalaya (gold filter)	qkggnogmoj
NiceHCK Himalaya (grey filter)	qkggmohlnj
NiceHCK JIALAI Carat	glhgnmmljg
NiceHCK Lofty	ojginofkum
NiceHCK M5 (blue filter)	bmghpseksb
NiceHCK M5 (grey filter)	olghoseisa
NiceHCK M5 (red filter)	vojdmteisa
NiceHCK NX7 Mk3 (black)	hkffnnjrn9
NiceHCK NX7 Mk3 (blue)	kkggomgqoa
NiceHCK NX7 Mk3 (red)	mkhhqndpob
NiceHCK NX7 MK4 (black filter)	jlffnlixmb
NiceHCK NX7 MK4 (gold filter)	mlggokgvpc
NiceHCK NX7 MK4 (red filter)	olhhpketpc
NiceHCK NX7 Pro (blue)	ijffnnjrm8
NiceHCK NX7 Pro (red)	mjhiqndokc
NiceHCK NX7 Pro (stock)	kjggonhqma
NiceHCK NX8	fmihnjlpli
NiceHCK PK2	xqidiertov
NiceHCK Topguy	uifgmohkxo
NiceHCK Traceless	tjgeegvwuu
Night Oblivion Butastur (off-off)	mjhhnikpni
Night Oblivion Butastur (off-on)	lkhhoilpfj
Night Oblivion Butastur (on-off)	mjihohisrj
Night Oblivion Butastur (on-on)	jkhgnimqgk
Nightjar Duality	2smgmnjmob
Nightjar Duality (switch back)	0qjgnolmp9
Nightjar Singularity	6ngennlprl
Nintendo Switch stock earbuds	veeasikwmu
Nixon RPM	wbffkeurun
Noble Audio Chronicle	lljkkejyee
Noble Audio Django	okechkusrs
Noble Audio Dulce Bass	kkdckoqrkv
Noble Audio Falcon	bpegoqngeh
Noble Audio Fokus Apollo (ANC off)	9i4sklthhk
Noble Audio Fokus Apollo (ANC on, review eq)	gojlhkqfjm
Noble Audio Fokus Apollo (ANC on)	hkepkgscfj
Noble Audio Fokus Apollo (passive)	9j4mkmwkjg
Noble Audio Fokus Mystique	7nfeopjpgh
Noble Audio Fokus Mystique (double flange)	6mfeoplojk
Noble Audio Fokus Mystique (single flange)	7nfeopjpgh
Noble Audio Fokus Pro	9ngfnpklhi
Noble Audio K10	rjfgmmgvko
Noble Audio K10 CIEM	ojffnljskn
Noble Audio K10 Encore	tjgfkmjugq
Noble Audio Kadence	ojggnoliem
Noble Audio Katana	rjffknktkr
Noble Audio Khan	mmkjjhiwfe
Noble Audio Knight	uifhkllqqs
Noble Audio Kublai Khan	injikhjvhi
Noble Audio M3	fmiiorehmh
Noble Audio PR P Tuning	tmigjjpm7h
Noble Audio PR R Tuning	unmjmjgkjj
Noble Audio Sage	qkfeknmqnu
Noble Audio Savanna	vmhgijkviq
Noble Audio Savant 2	qjfdjmmuqr
Noble Audio Sultan	gmhflllrjt
Noble Audio Sultan SE	fniglkmqeo
Noble Audio Trident	pkfcimrpex
Noble Audio Tux 5	dlgfjjqsej
Noble Audio Viking Ragnar	mommhclv9a
Noble Audio XM-1	7pihoqifoi
Nocs NS 400	9lfenplpho
Nocs NS200	eohflolpjq
Nocs NS300	vdiseesgos
Nocs NS700	kffnhlrfrp
Nocs NS800	qlhgjlktsn
NocturnaL Audio Atlantis	tjgejlmulu
NocturnaL Audio Avalon	ojechnquhq
NocturnaL Audio Eden	wliijnermu
NocturnaL Audio Gorham	pjfdjnmwkn
Noontec Hammo S	pjjfrhlkum
Noontec Rio	7nhgoqo7Bq
Noontec Zoro	ohgeijozlm
Noontec Zoro HD	kiedkmrouq
Noontec Zoro II HD	njhfmklqps
Noontec Zoro II Wireless (active)	rhfeknopqs
Noontec Zoro II Wireless (passive)	nkfelmnnvq
Nostalgia Audio Benbulbin	holikhnmqp
Nothing ear	hkkgnlljjs
Nothing ear (1)	eokjfqpbhf
Nothing ear (2)	mhjiqkiigf
Nothing ear (a)	hijinnkhkt
Nothing ear (stick)	sgmigrihci
NS Audio NS3	vnljmmbmsm
NS Audio NS5 MKII Extra Bass	olhimljloi
Nuarl NT01	jlhclpiwgm
Nuarl NT100	dkeemrlqlo
Nuarl NT110	ckeenrhsrk
NuForce EDC3	uljgjiixrs
NuForce Every Day Car	7mgemojvxr
NuForce HEM1	qkhgjnjqws
NuForce HEM8	pkfdhhvvno
NuForce HP-800	ogeeqqjjvn
NuForce NE-600X	8mgfnqnevj
NuForce NE-700M	9nihopihvi
NuForce Primo 8	wkjhkkeuut
NuForce Stride	mhedlpsghk
Nura NuraLoop	gmicmvcruh
Nura Nuraphone	oacsroahha
NVX EX10S	wjhhkbqxrp
NVX XPT100	wignnihjwo
NVX XPT100 (flat earpads)	wjhnnjfgwm
NXEars Basso	vhfdhkqult
NXEars Opera	tkiafsluqm
NXEars Sonata	tkhgkogpoo
oBravo Cupid	njeekosdvj
oBravo HAMT1	Bb0D5sqgub
oBravo Ra 21 C	xmjedtknvd
oBravo Ra C-Cu	zqcejteuyf
Ocharaku Co-Donguri Shizuku	ojggnthbyn
Ocharaku Donguri Keyaki	uniditlfmh
Ocharaku Donguri Ti Plus	qjfhoqeiys
Ocharaku Flat-4 Akakeyaki	qkhgkitjei
Ocharaku Flat-4 Akazakura	okfgmivgii
Ocharaku Flat-4 Kaede Type 1	siedlivldi
Ocharaku Flat-4 Kaede Type 2	ulfflgvl9f
Ocharaku Flat-4 Kuro Type II	pjghmgwehf
Ocharaku Flat-4 Ti Plus	nkggmguidj
Oladance OWS Sport (ANC off)	snjprw188d
Ollo Audio S5X	ukkgkmljlm
OLLO S4R	qidgwihkql
OLLO S4R 1.1	unhlkhhqqt
OneOdio A10	vondeqohpj
OneOdio A71D	mi8dupkmgi
OneOdio OpenRock Pro	vphgjpklnj
OneOdio OpenRock S	unmmjociii
OneOdio OpenRock X	ulrkikhgkm
OneOdio OpenRock X (ANC off)	vnkmjjkfnq
OnePlus Buds	tmnnliejdl
OnePlus Buds 3	ahhiqllfkg
OnePlus Buds 3 (ANC on)	fkkkjmnfm8
OnePlus Buds Pro	jimlokcobg
OnePlus Buds Pro 2	jekgnnhpdg
OnePlus Buds Z	4kgfkmtlmk
Onkyo A800	uciiliolll
Onkyo E900	rjffkknvgi
Onkyo ES-FC300	hkelhmnpun
Onkyo IE-HF300S	oiedkkqqnt
OpenAudio Mercury	dnjiolfotk
OpenAudio Siren	eniglknljo
Oppo Enco Air3	i5cfnnnvmp
Oppo Enco X	iigogkpjdj
Oppo Enco X2	iinbfmunjm
Oppo Enco X2 (Enco classic preset)	ghkkhkomig
Oppo Enco X3i	igijkokknc
Oppo PM1	vjihkhnpuq
Oppo PM1 (alternative earpads)	tkigkinqto
Oppo PM1 (PM2 earpads)	tkihljloup
Oppo PM1 (velour earpads)	vihgjipoqn
Oppo PM2	xjjilgkqrq
Oppo PM2 (PM1 alternative earpads)	tliikilpsn
Oppo PM2 (PM1 leather earpads)	tljijhnqqp
Oppo PM2 (PM1 velour pads)	skihjinopm
Oppo PM3	oo9mokjnlo
Oppo PM3 (Aliexpress earpads)	th9qokhlnp
Oppo PM3 (Aliexpress leather earpads)	qmdmojhkro
Oppo PM3 (sample A)	pkjmmkfkyr
Oppo PM3 (sample C)	slhlpiihuq
ORA GrapheneQ	jh9xkhmfkg
ORB CF-IEM Stella	sjfdhonsvs
Origami Audio Silver	mhccmqmovo
Oriolus Finschi	gkffnkjvnv
Oriolus Finschi Hifi	elgfnlivmt
Oriolus Forsteni	klhglilwci
Oriolus Isabellae	qkggmpfoni
Oriolus Mellianus	rigipjftpi
Oriolus Mk2	mmiglmgsts
Oriolus Monachaa	enjjpifsjb
Oriolus Percivali	lkhipigosn
Oriolus Szalayi	angfrikqop
Oriolus Traillii	lkgimkhtrj
Oriveti Basic	fkedkiuquq
Oriveti bleqk Dynabird	gmihnnesik
Oriveti bleqk Lowmaster	nkiiokfppc
Oriveti Dynabird	fnkinmcskk
Oriveti New Primacy	qjfehjqvjs
Oriveti OD100	gjffnrlhmm
Oriveti OD200	ufegmojotk
Oriveti OD200 (black nozzle)	vhginpfkum
Oriveti OD200 (silver nozzle)	tgfgmojmrj
Oriveti OH300	kkhgondumk
Oriveti OH500	nkhhoketqs
Oriveti OH700VB (bass switch off)	imqijihqqa
Oriveti OH700VB (bass switch on)	glmkjiirqb
Ortofon 0-One	vierectlkg
Ortofon 1	tmkw9bufgf
Ortofon 2	wlpleillri
Ostry KC06	viggmmezgf
Ostry KC06A	jjddmnmucj
Ourart Wine	kjfgnsn9us
Ovidius RX-100	kliinnfmwi
Ovidius TX-901	qlhhidstml
Padsmith In Ear Monitors	ohghnlipqe
Pai Audio DM2A	qkhgqlgonj
Pai Audio DR2	6ohgsqejrm
Palma DHS-1 (closed)	oledopipmo
Palma DHS-1 (open)	pkfdhwionp
Panasonic RP HT600 S	sejhgnivsl
Panasonic RP-HC101	xhfjdpiwml
Panasonic RP-HC800	dlfajvnp7e
Panasonic RP-HJE120	nhcckrpmqs
Panasonic RP-HJE125E	lhcckrqkss
Panasonic RP-HJE270E	qgbblwrckq
Paradigm Shift E1	hkcajlwuur
Paradigm Shift E3m	ikc9fpvuur
Parrot Zik 2.0	aqnjtn1y7d
Parrot Zik 3.0	gkkkrl6yfa
Peacock Audio P1	khdhonpbri
PEARS SH2	tkgfiknsmp
PEARS SH3	vkhgjnknnp
PEARS SH3 (CIEM)	ukhgkoipqp
Peerless MB PMB 85 Double Action	vohlon9mnk
Pendulumic Stance S1 Bluetooth	ygdhmioqrk
Penon 10th Anniversary IEM	kkffqjnonj
Penon DOME	nkgkpekolk
Penon Fan	dlffnpmjon
Penon Fan 2	pkgelkoqsm
Penon Fan 3 (off)	olgglkplmh
Penon Fan 3 (on)	mlggmloklh
Penon Globe	ikeejlsrkn
Penon IMPACT	nlhkkilmuk
Penon Orb	bnhekkqpqs
Penon QUATTRO	mlfelomosa
Penon Serial	mlghnkiprl
Penon Sphere	okedjnqnts
Penon Turbo (off, off-off-on)	qjhnogjjjl
Penon Turbo (off, off-on-off)	ojglpgkkjm
Penon Turbo (off, off-on-on)	njglphkkkm
Penon Turbo (off, on-off-off)	jkfkqhkjjm
Penon Turbo (off, on-off-on)	ljfkqhkkkm
Penon Turbo (off, on-on-off)	ljfkqhkkkm
Penon Turbo (off, on-on-on)	ljfkqhkkkm
Penon Turbo (on, off-off-off)	ejdftkllln
Penon Turbo (on, off-off-on)	djdftlllln
Penon Turbo (on, off-on-on)	djdetlllln
Penon Turbo (on, on-off-off)	djdetlllln
Penon Turbo (on, on-off-on)	djdetlllln
Penon Turbo (on, on-on-off)	djdetlllln
Penon Turbo (on, on-on-on)	djdetlllln
Penon Vortex	olhfllnooi
Periodic Audio Be	elffmoiskn
Periodic Audio Beryllium V3	cleenrkkym
Periodic Audio Carbon	alfgoqhmrs
Periodic Audio Carbon V3	9mggoqjfvr
Periodic Audio Magnesium V3	dlffnqkhym
Periodic Audio Mg	fjddlsnksk
Periodic Audio Ti	lhcdksrdom
Periodic Audio Titanium V3	9mgforq3wm
Phiaton Bridge MS 500	ngfpncojyn
Phiaton Chord MS 530	tihkpefvxt
Phiaton Chord MS 530 (ANC on)	zjllj9kxwt
Phiaton Chord MS 530 (wireless)	pfhloffvxt
Phiaton Moderna MS200	vfccfsnxln
Phiaton MS 100 BA	rkgejlntrt
Phiaton MS 300	xehhofgxpq
Phiaton MS 400	xfgknejvon
Phiaton PS 20	xkgfbrltnu
Phiaton PS 200	uligjiltdn
Phiaton PS 210	xkhhfokpts
Phiaton PS 300 NC	vcd9qubztp
Phiaton PS 320	skgdsletoj
Phiaton PS 500	vfchrekvnp
Philips ActionFit SHQ5200	xbdhkirowt
Philips Cityscape Downtown	pkmjk9smvs
Philips Construct	gmbohawruq
Philips Fidelio L1	khhfnubpuk
Philips Fidelio L2	njcjvqaijf
Philips Fidelio M1	hkflllkmpl
Philips Fidelio M2L	xj7gnlporm
Philips Fidelio NC1	lkhhjnsaop
Philips Fidelio S1 Early 2013	nlihmkmiqo
Philips Fidelio S2 (2013)	njghmjpjlq
Philips Fidelio S2 (early 2013)	olhimkljpo
Philips Fidelio X1	t8fhloniin
Philips Fidelio X2	taiijlojrh
Philips Fidelio X2HR	ucijljmkkm
Philips Fidelio X3	vffglguncl
Philips L2	khihpqcnok
Philips O'Neil Bend	redelfwpus
Philips O'Neil Crash	ihcelvjntk
Philips SBC HP910	ulhjolkdgm
Philips SHE3590	anihoqgknp
Philips SHE3590PK28	amgfnpmfoq
Philips SHE3855	emhhongnin
Philips SHP9500	vkfjmgrfgk
Philips SHP9600	vfchjmsjfj
Philips SHS8000	ukhhmpifpt
Philips SME3580	8nhgoqhinq
Philips TAE1105	kjefnpmklp
Philips TAH2005BK00	unmiul6mef
Philips TX1	clfenlophq
Philips TX2	glfgnnkpgq
Phonak PFE 112	tlhgklloii
Phonak PFE 121 (black filter)	qkgfjjptof
Phonak PFE 121 (gray filter)	wkihlkipne
Phonak PFE 121 (green filter)	nkfdiksuqh
Phonak PFE 232	ojfdilpupo
Phonon SMB2	udifpiitoj
Pioneer DJ HDJ-CUE1BT	dhekmllojl
Pioneer HDJ-1000	xmfkpdkmtp
Pioneer HDJ-1000 Gold	wofjodmono
Pioneer HDJ-2000	zidilgpowj
Pioneer HDJ-500	wghhhdwmho
Pioneer Monitor 10	xpfiqierup
Pioneer Monitor 10 II	iil7rsbwvl
Pioneer Monitor 10 II (sample 1)	kik9rpcvwn
Pioneer Monitor 10 II (sample 2)	hjk5qv9yuj
Pioneer SE-2P	Dnfh3ppBxw
Pioneer SE-A1000	tnehngvaff
Pioneer SE-CX9	uhfeiqomqu
Pioneer SE-M290	vdedjfxsmr
Pioneer SE-Master1	rhddjpqmbq
Pioneer SE-MJ31	xnfkmhcAoe
Plantronics 325T	yk9kojllus
Plantronics BackBeat 500 (wired)	mjggnkkrvp
Plantronics BackBeat Fit	xjbeeqvlok
Plantronics BackBeat Go 600	kgchtjmn67
Plantronics BackBeat Go 600 (wired, pad swap)	udadxqgiie
Plantronics BackBeat Go 600 (wireless, pad swap)	rbbixmfk69
Plantronics Backbeat Go 810	teglmkjnhg
Plantronics Backbeat Pro	0rskmjjgd6
Plantronics BackBeat Pro 2	5pslijjjdf
Plantronics RIG 800LX	mijlokldkc
Plantronics Voyager 3200	ulsqbklcc9
Plantronics Voyager 5200	vnnikhiolc
Plantronics Voyager Legend	vltmhjkcie
Ploopy Ploopy Headphones	0ioiufs7fk
Plugged Crown	rig8pojuvt
Plunge Audio Unity IEM	umhgmkgsdr
PlusSound Sonora	mjhhmkkqfb
PlusSound Volta	ljikmilnhf
PMG Audio Apx SE	hlhgmkmom9
PNY Midtown	ckedlqkuiv
PNY Uptown	9mgfnpgugv
Polk Audio Buckle	gkkhlepssl
Polk Audio Hinge	gjahjukots
Polk Audio Melee	ljfdkhvoql
Polk Audio UltraFit 1000	Ecce9fAAzx
Polk Audio UltraFit 2000	xkbhvhfqsk
Polk Audio UltraFit 2000 (sample A)	vmehxibooj
Polk Audio UltraFit 2000 (sample B)	zh9hsgksvl
Polk Audio UltraFit 300	dkdclplvyt
Polk Audio UltraFit 3000	dkcbjnsuvs
Polk Audio UltraFit 3000 (sample A)	fkcbknrtvs
Polk Audio UltraFit 3000 (sample B)	ekdemqlpAt
Polk Audio UltraFit 500	Dgff9fAxxv
Polk Audio UltraFit 500 (sample 1)	znigcbxvuu
Polk Audio UltraFit 500 (sample 2)	zmejf9zpvt
Polk Audio UltraFocus 8000	fokhnjljmh
Polk Audio UltraFocus 8000 NC	gnjiijqlji
PopClik EVOLO	djeemrmokp
PopClik String	blffopiokq
Precide ERGO 2	xpkikifqwo
Prisma Audio Azul	ulihklhrqi
Prisma Audio Azul (AZLA Sedna eartips)	ukhgllkplf
Prisma Audio Azul (Final Audio Type E eartips)	ukhhlljphf
Prisma Audio Azul (JVC Spiral Dot eartips)	ukhgllkokg
Prisma Audio Azul (SpinFit eartips)	ukhglljqie
PSB M4U 1	nqghrjndln
PSB M4U 2	mojishiipq
PSB M4U 2 (passive)	mpfjqgpfoo
PSB M4U 4	lkijmjkmwk
PSB M4U 8	lghmkknhpm
PSB M4U 8 (wired, passive)	imferkpfop
PULA Anvil 114	rhfhkmnlmj
PULA PA01	gnjinkkito
PULA PA02	gmhimjjrqb
Pump Audio Earphones	7kdcmqrkrt
Punch Audio Martilo	9mjklkjore
PureSound Clarity One	ngcdlqtiel
Puro JuniorJams	amgdsloidh
QCY Crossky C30	smpenjo96i
QCY G1	eidjkknspt
QCY H3	p97nlvgllo
QCY H3 (ANC on)	pabngxfmlm
QCY H3 Pro (ANC off)	ccnikqfmpl
QCY H3 Pro (ANC on)	gimipmehql
QCY HT05 Melobuds	rdilkliook
QCY HT05 Melobuds (ANC off)	ngklkkilkl
QCY HT05 Melobuds (ANC on)	mhjkjnmglm
QCY HT07 Arcbuds	ndhnkmkipt
QCY HT10 AilyBuds Pro+ (ANC off)	xhepfiixkq
QCY HT10 AilyBuds Pro+ (ANC on)	xddoekjxmq
QCY MeloBuds Pro	mfgpfnmhpt
QCY Melobuds Pro (ANC off)	qbfqimkglr
QCY Melobuds Pro (ANC on)	qcfqgoncms
QCY T12 ANC2	qefokllfgi
QCY T13	edifmohvnf
QCY T13 ANC2 (ANC on)	qefokllfgi
QCY T16	ehehkmoqof
QCY T17	kfmilljojc
QCY T18	ljfmjmnifr
QCY T20	slosmob814
QCY T5	oiiflpcwpm
qdc 3SH	olfdkknyoj
qdc 4SS	rlgejlnrpk
qdc 5SH	nkffnikurh
qdc 8CL (CIEM)	kkfgoiksvo
qdc 8SH	qkhiqfiqrl
qdc 8SL	lkghoikrqk
qdc 8SS	wlihkgkvpj
qdc Anole V14 (off-off-off-off)	ilghnjjrli
qdc Anole V14 (off-off-off-on)	ilghnjkrki
qdc Anole V14 (off-off-on-off)	ilghnjjrjg
qdc Anole V14 (off-on-off-off)	llikpdirok
qdc Anole V14 (on-off-off-off)	fkffnklsmk
qdc Anole V14 (on-on-on-on)	ilhiqeksnj
qdc Anole V3	jkdcipqumm
qdc Anole V3 (bass, treble)	hkdbipstgk
qdc Anole V3 (bass)	gkdaiqruon
qdc Anole V3 (treble)	kkeciortfj
qdc Anole V6	llhinkhqte
qdc Anole V6 (bass, mids)	llhjohhptf
qdc Anole V6 (bass)	jlghnlhrtf
qdc Anole V6 (mids)	nlikohhose
qdc Anole VX	ojginglqom
qdc Anole VX (all)	kjegpgnsqm
qdc Anole VX (bass)	jjefoinsro
qdc Anole VX (mids)	qjhjpelppm
qdc Anole VX (off-off-off)	jlghogmsjg
qdc Anole VX (off-off-on)	ilfgofnuid
qdc Anole VX (off-on-off)	jlgipcntki
qdc Anole VX (on-off-off)	ckddohqvmj
qdc Anole VX (treble)	pjginglqni
qdc Dmagic	ujgflrcrpg
qdc Gemini	olhinijppj
qdc Gemini (bass)	jkfgojlqrk
qdc Neptune	rlgfknkpqs
qdc Tiger	rkhhpgiqro
qdc Uranus	vkhckqguks
QianYun Qian39	voljmjkcrt
QKZ AK6	fjeenrlmkq
QKZ VK4	enihmknknk
QKZ VK4 (pre-revision)	glhgnnjmom
QKZ VK4 (revised)	jjffopfonl
QKZ x HBB	ijffmnkpvi
QKZ x HBB Hades	fibbkvnnxr
QKZ x HBB Khan	jfiljlmkke
QKZ ZXD	ijeemsjmpj
QKZ ZXN	ljeemsklok
QUAD Era-1	rjgglavtii
QUAD ERA-1 (angled leather earpads)	qjghlaxmnd
QUAD ERA-1 (hybrid earpads)	sjhhldrrih
Qudelix Qx-over	fkedmqmlws
Queen of Audio Adonis	qkgfllmpji
Queen of Audio Adonix New	amfelmoqip
Queen of Audio Aviation	nlhimjlmqr
Queen of Audio Gimlet	mjfgnpijsh
Queen of Audio Mimosa	gkgfllnpil
Queen of Audio Mojito	ujhhmjmjou
Queen of Audio Pink Lady	jkgellntlm
Queen of Audio QM50	qjfelsikqt
Queen of Audio Vesper	ilgellmtls
Questyle NHB12	dleenolohk
RAAL CA1a (open earpads)	ukgimbulhq
RAAL SR1a	vmkjmldokq
RAAL SR1a (ear contact, OBC off)	umplmk9nhl
RAAL SR1a (ear contact, OBC on)	vmmjllcpkn
RAAL SR1a (no ear contact, OBC off)	tlqlnkajfj
RAAL SR1a (no ear contact, OBC on)	umojlkdmin
RAAL SR1a (no ear contact)	umkjmlfkgr
Radius HP-NEF11	olgeisrbam
Radius HP-NHA11	8mffnpmhot
Radius HP-NHR11	9lfenpnjmt
Radius HP-TWF31	qkgdhlrpvc
Radius HP-TWF41	wigefnpsvg
Raptgo Hook	klggnmgtjf
Raptgo Hook-X	klhiomerjg
Raptgo Leaf D01	nkhioodojm
Raycon E100	9ledopnod6
Raycon E25	8ga4tssqbg
Raycon E50	vhdbjmsriv
Raycon E55	sdb3rrntsp
Raycon The Fitness Earbuds (2021 Edition)	5mghtsi7i7
Razer Barracuda	mmfiqkinkm
Razer Barracuda Pro	jnilpidqai
Razer Barracuda X	ji5ofktunj
Razer Barracuda X (2021)	oegkipjrhc
Razer Barracuda X (2022)	kafiplfvnj
Razer BlackShark V2	tihhnojhhf
Razer BlackShark V2 HyperSpeed	upbnrjdofp
Razer BlackShark V2 Pro	mjecqmrkbi
Razer BlackShark V2 Pro 2023	ukekrhgpcg
Razer BlackShark V2 X	ki9mlintnh
Razer Hammerhead Pro HyperSpeed	ilhipiiofm
Razer Hammerhead True Wireless (2019)	md9chxkxks
Razer Hammerhead True Wireless (2021)	kkeaimtukq
Razer Hammerhead True Wireless Pro	pijmlhjobj
Razer Hammerhead USB-C ANC	umolicokqa
Razer Kaira Pro	pkhdukbyci
Razer Kaira X	rlfftjhsal
Razer Kraken Pro V2	wcbfhltujh
Razer Kraken Tournament Edition	xd8iarutej
Razer Kraken Ultimate	wbeflnnnog
Razer Kraken USB	yb9k9nvvdj
Razer Kraken V3	rmagolmrmk
Razer Kraken V3 HyperSense	okbfnkormi
Razer Kraken V3 Pro	mkampngmgf
Razer Kraken V3 X	vbbfnlizum
Razer Kraken X	sh8eqfsw8c
Razer Man O'War	ocecokrqgf
Razer Moray	skijplbsdm
Razer Nari Ultimate	qgbeoqmmrj
Razer Opus 2020	ollkkjjmec
Razer Opus 2020 (ANC off)	olnfohisjd
Razer Opus 2020 (ANC on)	iqnjlijmee
Razer Opus 2020 (passive)	mkeetjmmhf
Razer Opus 2021	mjgjodorhj
Razer Opus X	qkegpkqhjc
RBH EP1	boignnlhst
RBH EP2	6mifqlnibv
RBH EP3	6medmqolno
realme Buds Air 3S	hgjjnmfpjk
realme Buds Air 5 Pro	phliiqfpej
realme Buds Air 5 Pro (ANC on)	mgjhjnjomb
realme Buds Air 5 Pro (original sound effect mode)	gjkgjnjrlb
realme Buds Air 6 Pro (ANC on)	jkliioiona
realme Buds Air 7 Pro (ANC off)	djpgkjnllc
realme Buds Air 7 Pro (ANC on)	djpgkinlme
realme Buds Air6 Pro	phljimiokd
realme Buds Air6 Pro (Nature Balance eq)	iklhjoioke
Redmi Buds 6 Pro (ANC off)	vejkikhrso
Redmi Buds 6 Pro (ANC on)	rgkjijirro
Redmi Buds 6 Pro (Transparency)	vejkijhrso
Redragon Arrow H858	jlbqlmfs2c
Redragon Diomedes H386	vfefpjjxji
Redragon H510 Zeus Pro	udbpmldsej
Redragon H510 Zeus-X	vectkkdqcl
Redragon H848 IRE PRO	t998zojqcb
Reecho SG-01	jkfgnqglqm
Reecho SG-01 OVA	lkghnqflsi
Reecho SG-03	cniippfjun
Reecho Summer	pkfejpkqst
RevoNext QT2	ekeemmqqne
RevoNext RH-213 Plus	ilfgnqhljf
RHA CL1	qlhfjopi76
RHA CL2	vihjnphayp
RHA CL750	mlhejnwc8b
RHA MA-350	aleemjxdpq
RHA MA450i	9lfemnuckr
RHA MA600	fjcbjrybpj
RHA MA750	pkhfikufrl
RHA S500i	vkijmpdkmd
RHA SA-850	vhmhfhosdw
RHA SA950i	kjiffontqu
RHA T10i (bass filter)	djddlqmsul
RHA T10i (reference filter)	ejddlrktuj
RHA T10i (treble filter)	fjeeltjowl
RHA T20 (bass filter)	hjgholodvm
RHA T20 (reference filter)	ikghomoatm
RHA T20 (treble filter)	jkhhono7sn
RHA T20i	elggomlgrn
RHA TrueConnect	7ngeoljyf5
Rhapsodio Clipper	hjddmspett
Rhapsodio Infinity Mk1	kjefkqnmom
Rhapsodio Infinity Mk2	uifelshlts
Rhapsodio Return	vjiimkerxt
Rikubuds Alter Rider 3	vlfklioigo
Ritmix RH-508	vjkrgfkljn
ROCCAT Elo 7.1 Air	sjchojondh
ROCCAT Syn Pro Air	oidrmgip4e
Rock Jaw Alpha Genus (black filter)	shfflqkmip
Rock Jaw Alpha Genus (silver filters)	akffnrmgno
Rock Zircon	qjefrpjhak
RockIt Sounds R30	yjihjhiwwt
RockIt Sounds R50	umihjimtcf
Rose BR5 Mk2	ukhgjnlloj
Rose Ceramics	ohhknmglsa
Rose Ceramics (HiFi)	mihknmhls9
Rose Ceramics (Pop)	ggdjqphjn5
Rose Ceramics (Rock)	cfdhqpjlo8
Rose Ceramics X (HiFi)	lkgioldupc
Rose EARFREE-i5 (HiFi)	kkggmnkpjh
Rose Mini2	xifeimkwuk
Rose Mini2 MKII 2.0	qlheimmvdd
Rose QT9 MK2	llghokhsno
Rose QT9 MK2s	mlhipihrph
Rose QT9 MK3	oljkmlgkkm
Rose QuietSea	okggmohnij
Rose Star City 5 Pro	pkhiknjnin
Rose Technics Aurora Ultra	ohegnnhrsd
Rose Technics Ceramics-X (ANC off, Hifi)	jkgjpmbwq8
Rose Technics Ceramics-X (ANC on, Hifi)	mlgikodvr9
Rose Technics North Forest	tmoojaqegj
Rose Technics OpenFree (ANC off, balanced)	rlqgqsh126
Rose Technics QuietSea	ojfgnqhnmk
Rose Technics Star City 5	gkhjlphlrl
Rosson Audio Design RAD-0	tihgifrtnl
RUNMUS RGB K1 Gaming Headset	yaagkewrkn
Sabbat E12	amgfpqn8tq
Samson SR850	tegkpmhj48
Samsung AKG EO-IG955	liefnrklmc
Samsung AKG EO-IG955 Type-C	ijgfqpjkia
Samsung Earphones Tuned by AKG	tgegmpkmkc
Samsung Earphones Tuned by AKG (2019)	mhefnqkmkb
Samsung EO-IC100 Type-C	fkghnoiloc
Samsung EO-IC500 ANC Type-C	wfgjpfiroi
Samsung Galaxy Buds	ojkikmhmkq
Samsung Galaxy Buds 3 (ANC off)	vnikifltmg
Samsung Galaxy Buds 3 (ANC on)	xgfnkelvmf
Samsung Galaxy Buds FE	7mlgpljlfp
Samsung Galaxy Buds FE (ANC on, balanced)	gmlijmlkgj
Samsung Galaxy Buds Live	teengommhg
Samsung Galaxy Buds Plus	jkljnkjhli
Samsung Galaxy Buds Pro	kkggkomlhe
Samsung Galaxy Buds2	ljijklisko
Samsung Galaxy Buds2 Pro	hnkjkllhoh
Samsung Galaxy Buds2 Pro (Ambient mode)	hmkjjlmipk
Samsung Galaxy Buds2 Pro (ANC mode)	hnkjjlmhqk
Samsung Galaxy Buds2 Pro (Passive mode)	gmjjklmiqk
Samsung Galaxy Buds3	philjlfsmo
Samsung Galaxy Buds3 Pro	9iignlnmgk
Samsung Gear IconX	nhfgqmiokg
Samsung Level On	lidikrjlyr
Samsung Level On Wireless	vhefoipona
Samsung Level Over Wireless	ugggkirlhf
Samsung Level U Pro	dledomqklf
Samsung U Flex	skiioohfka
Sansui SS10	wfcm8dBupv
Sansui SS100	vnpijhlfvj
Sansui SS35	xlrxabgjvt
Santa Cruz Audio SC1000 (active)	wmjjkklirm
Santa Cruz Audio SC1000 (passive)	rlolmlm44l
Sash Tres 45	uihikjokmn
Sash Tres 45 (closed back, leather earpads)	ukinnndglg
Sash Tres 45 (open back, leather earpads)	vjiihkpjlk
Sash Tres 45 (perforated leather earpads)	tnkikiqeii
Sash Tres 45 (velour earpads)	tnjhkiregi
Sash Tres SE Exclusive (leather earpads)	ujihhkshjl
Sash Tres Second Edition (closed cups, hybrid earpads)	tmmonhj7hg
Sash Tres Second Edition (closed cups, leather earpads)	vjjmnjgfkk
Sash Tres Second Edition (closed cups, suede earpads)	ulrqjejaii
Sash Tres Second Edition (honeycomb grill)	uiigiktflm
Sash Tres Second Edition (hybrid earpads)	thgflmv9kj
Sash Tres Second Edition (leather earpads)	uiigiktflm
Sash Tres Second Edition (S-style grill)	uiighkuell
Sash Tres Second Edition (suede earpads)	vlihlhtbjk
SATOLEX Tubomi DH298-A1Bk	hicclsomjs
SATOLEX Tubomi DH302-A1Bs	ngcckspkps
SATOLEX Tubomi DH310-A1SS	mhcdkspljs
SATOLEX Tumuri DH303-A1	uheekrkmjo
Scosche RH1060 Bluetooth	leccxknfqk
Seahf AWK-009	dmhgoomedm
SeeAudio Bravery	lkggpkhrpf
SeeAudio Bravery AE	pjgiqjhojd
SeeAudio Kaguya	hlhipnfnre
SeeAudio MIU	gnihmliomd
SeeAudio Neo	ilhiojgrrh
SeeAudio x Crinacle Yume Midnight	gokhllgrrf
SeeAudio Yume	jplhllgopn
SeeAudio Yume 2	kliiokgqne
Seek Real Audio Airship	jliinnfmpn
Sendy Aiva	ujjildrntd
Sendy Aiya	alfeosoavq
Sendy Peacock	vhigkgpqqj
Senfer DT6	lkfejjwmsk
Sennheiser ACCENTUM	akkjjjpnmi
Sennheiser ACCENTUM Plus	8nkhkmnnjh
Sennheiser Accentum TWS	kkhfkjntle
Sennheiser AMBEO Smart Headset	mgdcnmnw9e
Sennheiser Amperior	whfsodfqjk
Sennheiser CX 1.00	ijeeljowig
Sennheiser CX 2.00	jjfflknvde
Sennheiser CX 3.00	fmffmllvag
Sennheiser CX 300-II	ojdcilvpfp
Sennheiser CX 400BT	gledlmprlm
Sennheiser CX 500	ikdbimurgs
Sennheiser CX 680	wkgdjpmkor
Sennheiser CX 880	lhddlnrp9n
Sennheiser CX Plus True Wireless	kihdljoxa8
Sennheiser CX True Wireless	hjedmkpxdc
Sennheiser CXC-700	giefpmmpbl
Sennheiser EH 150	vmmzg6mfnm
Sennheiser EH 250	vkhpifohmd
Sennheiser EH 350	unljkgofl9
Sennheiser GAME ONE	wlgikjlmpo
Sennheiser HD 201	umlojhgnhk
Sennheiser HD 202	ubdmodmrtq
Sennheiser HD 203	uabugepmqn
Sennheiser HD 205	whgjpgkmor
Sennheiser HD 205 II	ojffqikqmr
Sennheiser HD 212 PRO	xignldpgph
Sennheiser HD 218	wgccojrolo
Sennheiser HD 219	tcdiqjogtl
Sennheiser HD 228	vddbojrpnq
Sennheiser HD 229	vedipjogqm
Sennheiser HD 229 Black	rcdiqiqeol
Sennheiser HD 238	ugfgmlqfll
Sennheiser HD 239	sgggmjqikn
Sennheiser HD 25	vlfdpnirhk
Sennheiser HD 25 Aluminium	xidiqkgpon
Sennheiser HD 25 Aluminum	jkbkslgpsi
Sennheiser HD 25 Plus	ufdmnkhooo
Sennheiser HD 25-1	skcmpjfsoi
Sennheiser HD 25-1 II	sgdgslgrkl
Sennheiser HD 25-1 II B (2012)	qhfjnjjpsk
Sennheiser HD 25-SP	vfdftmimsj
Sennheiser HD 250 II	lieknjmkkf
Sennheiser HD 250BT	tgflkkkmii
Sennheiser HD 280 Pro	apmjijktlp
Sennheiser HD 280 Pro (SPC Gear velour earpads)	witofecvpr
Sennheiser HD 380 Pro	7nmngnjirk
Sennheiser HD 4	wghhmikoos
Sennheiser HD 4.40BT	hiiriigrhj
Sennheiser HD 4.50 BTNC	njkpoh7xhq
Sennheiser HD 400 Pro	vljklikiod
Sennheiser HD 400 S	sektfghonp
Sennheiser HD 414	xojilmgiAr
Sennheiser HD 419	jjeaomotts
Sennheiser HD 424	vokgplfjwp
Sennheiser HD 424-X	umqjnjcjnk
Sennheiser HD 428	wphkmgmjom
Sennheiser HD 429	nkjglgnstq
Sennheiser HD 438	viimlaqnmo
Sennheiser HD 439	qhjdnimsts
Sennheiser HD 448	xmihniiotq
Sennheiser HD 449	ogjgohkrtn
Sennheiser HD 450BT	ikgkmjfwpr
Sennheiser HD 471i	nkmdlhmstr
Sennheiser HD 490 Pro	shhikjrfho
Sennheiser HD 490 Pro (mixing earpads)	uijjlgnlnl
Sennheiser HD 490 Pro (producing earpads)	oiihkjsgnm
Sennheiser HD 505	vjijnjkiom
Sennheiser HD 505 Copper Edition	vjijnjkinm
Sennheiser HD 515	uokhjku5rk
Sennheiser HD 518	whgeinqknm
Sennheiser HD 540 reference-II	vmffimrjhk
Sennheiser HD 545 Reference	vnnjligmqj
Sennheiser HD 550	vjiilhnlok
Sennheiser HD 555	wnjiljlhyn
Sennheiser HD 558	umjhllparn
Sennheiser HD 559	vdcdhrthur
Sennheiser HD 560 Ovation II	unkimmjdpf
Sennheiser HD 560S	uiijmimipl
Sennheiser HD 560S (worn earpads)	wkjkljgmsk
Sennheiser HD 565 Ovation	wokilikhym
Sennheiser HD 569	idcnjippto
Sennheiser HD 575	wlfglmqcur
Sennheiser HD 579	wifgknqerq
Sennheiser HD 580	wlhjmkleun
Sennheiser HD 580 (black paper)	wlgimjogok
Sennheiser HD 580 (black silk)	wihimjkjom
Sennheiser HD 580 (silver screen)	wlijmikjtn
Sennheiser HD 580 (white paper)	wlfhliojqo
Sennheiser HD 580 precision	vojkojkbwk
Sennheiser HD 58X	wihilinkpp
Sennheiser HD 58X (Brainwavz microsuede oval earpads)	xoiggkqkyl
Sennheiser HD 595	vnjhkhnkrm
Sennheiser HD 598	wiggllqfqp
Sennheiser HD 598 CS	jjgnmgkovo
Sennheiser HD 599	wkegklseoq
Sennheiser HD 600	wkhjmjljqk
Sennheiser HD 600 (2020, worn earpads)	xkgiljllun
Sennheiser HD 600 (2020)	wkhjnjkitm
Sennheiser HD 600 (pre-2020, semi-worn earpads)	xkgilimlto
Sennheiser HD 600 (pre-2020, worn earpads)	wlhjmjkjtm
Sennheiser HD 620S	nlbqhmmjpj
Sennheiser HD 630VB	ukcsoefpsi
Sennheiser HD 650	wjgimjmjsm
Sennheiser HD 650 (2020, worn earpads)	xjgiljipwp
Sennheiser HD 650 (2020)	vhgimjnhsn
Sennheiser HD 650 (balanced)	vlgimknhnk
Sennheiser HD 650 (pre-2020, semi-worn earpads)	wkghllmitl
Sennheiser HD 650 (pre-2020, worn earpads)	xkgjmkhnwp
Sennheiser HD 660 S	xlhhlhnlsq
Sennheiser HD 660S (Dekoni Fenestrated Sheepskin Earpads)	xjghkipmrq
Sennheiser HD 660S2	wjhhlinlpn
Sennheiser HD 6XX	wjgimjmjsm
Sennheiser HD 700	viefjjvigo
Sennheiser HD 700 (Dekoni elite velours earpads)	vkgfjjtien
Sennheiser HD 800	umhhjjrhdj
Sennheiser HD 800 (sample 1)	ukggjiwf9i
Sennheiser HD 800 (sample 2)	tlggikweaf
Sennheiser HD 800 (SDR mod, Dekoni fenestrated sheepskin earpads)	unkhjhphie
Sennheiser HD 800 (SDR mod)	vlhhkjolgj
Sennheiser HD 800 S	ukhhjkpjhi
Sennheiser HD 800 S (Dekoni fenestrated sheepskin earpads)	unjhjirhgc
Sennheiser HD 800 S (sample 1)	ujggikuihj
Sennheiser HD 800 S (serial number 01067)	ujhgjjthhh
Sennheiser HD 800 S (serial number 01070)	ujhgjjtiil
Sennheiser HD 800 S (ZMF sheepskin earpads)	uiggjjrlog
Sennheiser HD 820	er5soeonmn
Sennheiser HD 8XX	tmgfekyill
Sennheiser HD R 130	uokfkpp7jr
Sennheiser HD1 In-Ear	hjdbmnoyac
Sennheiser HD1 In-Ear Wireless	gkcbmnoybd
Sennheiser HD1 On-Ear	jiegwlbtbf
Sennheiser HD1 Over-Ear	kigmjjison
Sennheiser HD1 Wireless	mlilrfcrqm
Sennheiser HD25-1 II (bad seal)	uoihnlfpjl
Sennheiser HE 1 Orpheus 2	ojkjjknikg
Sennheiser HE 1 Orpheus 2 (semi-worn earpads)	phkikiqimi
Sennheiser HE 60	umjjljmhgi
Sennheiser HE 90 Orpheus	vkkjlkkimi
Sennheiser IE 200	lmjimjhtic
Sennheiser IE 200 (AZLA Max eartips)	eniglkiwjb
Sennheiser IE 200 (JVC Spiral Dot++ eartips)	eniglkixib
Sennheiser IE 200 (long nozzle)	unkjmjfpef
Sennheiser IE 200 (short nozzle)	nljimlftje
Sennheiser IE 200 (SoftEars UC eartips)	gmihlkiwh9
Sennheiser IE 300	dlfelknvge
Sennheiser IE 300 (AZLA Sedna Light eartips)	cledklrvb8
Sennheiser IE 300 (Final Audio Type E eartips)	dledklssef
Sennheiser IE 4	bmhgopt0lo
Sennheiser IE 40 Pro	qiggkiosfd
Sennheiser IE 400 Pro	flfdklquig
Sennheiser IE 500 Pro	lkhflhlzrk
Sennheiser IE 6	niddlouduo
Sennheiser IE 600	eojhmleumb
Sennheiser IE 600 (AZLA Sedna eartips)	coihmmhte8
Sennheiser IE 600 (Final Audio Type E eartips)	coihmmhtgb
Sennheiser IE 600 (foam eartips)	bpjhnlfuja
Sennheiser IE 600 (Moondrop Spring eartips)	coihmlhwg9
Sennheiser IE 600 (silicone eartips)	bpjhnlfuj9
Sennheiser IE 600 (Spinfit eartips)	coihmmgtea
Sennheiser IE 8	rgbckrpoul
Sennheiser IE 80 (half)	kiddllulor
Sennheiser IE 80 (max)	gjddllulpr
Sennheiser IE 80 (min)	ugefkjtlns
Sennheiser IE 80 S	ekcclrtgqt
Sennheiser IE 80 S (half)	jjeemnrftq
Sennheiser IE 80 S (max)	gkfelosfuq
Sennheiser IE 80 S (min)	tgeglmrfrq
Sennheiser IE 800	flfelhpxh9
Sennheiser IE 800 (sample A)	fkfflhqvjh
Sennheiser IE 800 (sample B)	wiffjhpxha
Sennheiser IE 800 (sample C)	jkfflhqygc
Sennheiser IE 800 S	kkgflhnwlj
Sennheiser IE 900	fmigmijxgf
Sennheiser IE 900 (Final Audio Type E eartips)	emhglhnvdh
Sennheiser IE 900 (foam eartips)	dnihmhkygd
Sennheiser IE 900 (silicone eartips)	dnihmhkyfc
Sennheiser MM 50 iP	sgcdjnumdp
Sennheiser MM 550	wmpmgn6rpk
Sennheiser Momentum	siigngktto
Sennheiser Momentum 2.0	vgilkhjpst
Sennheiser Momentum 2.0 (wired, active)	u9cpqkdoll
Sennheiser Momentum 2.0 (wired, passive)	nhakpmiplm
Sennheiser Momentum 2.0 (wireless)	gkilohcvvr
Sennheiser Momentum 3 Wireless	kheknpfphj
Sennheiser Momentum 4 Wireless	5nhemivjln
Sennheiser Momentum 4 Wireless (passive)	jneml1Bqvo
Sennheiser Momentum In-Ear	fkcajqqvdh
Sennheiser Momentum On-Ear	jifjqjfsjn
Sennheiser MOMENTUM Sport	dkjfpjjshn
Sennheiser Momentum True Wireless	jkfeljmzgc
Sennheiser Momentum True Wireless 2	qhfdkllzke
Sennheiser Momentum True Wireless 3	hmjhljhwld
Sennheiser Momentum True Wireless 3 (ANC off)	imjgmkgxka
Sennheiser Momentum True Wireless 3 (ANC on)	jljhmkgxk9
Sennheiser MOMENTUM True Wireless 4	jliiklhvod
Sennheiser Momentum True Wireless 4 (ANC Off)	jlhfkmiwoa
Sennheiser Momentum True Wireless 4 (ANC On)	jmiikjgxob
Sennheiser Momentum Wireless (wired, active)	nmmoqeamrs
Sennheiser Momentum Wireless (wired, passive)	phfkmhjqss
Sennheiser Momentum Wireless (wireless)	ommprdalrt
Sennheiser MX 560	slpompa8dj
Sennheiser MX 680	tlpqmn7f9g
Sennheiser OCX 685	rjfempmgns
Sennheiser OMX 680	khgekqnlps
Sennheiser PC 373D	wlhhkjmmkl
Sennheiser PC37X	wmhhkjnknn
Sennheiser PC38X	vgijnijksq
Sennheiser PC38X (velour earpads)	vfiimjkksr
Sennheiser PMX 100	ufegnkogun
Sennheiser PMX 680	khgekqnlps
Sennheiser PX 100	uffgnjnjwr
Sennheiser PX 100 II	zfchnijuus
Sennheiser PX 100-IIi	xifgmjmlto
Sennheiser PX 200	vnnnhfjkss
Sennheiser PX 200 II	xkkkkgjkvr
Sennheiser PX 200-IIi	wmkhklhpsp
Sennheiser PX 360	xjjlol6tsj
Sennheiser PXC 150	vlhkpifmjn
Sennheiser PXC 250 II	vkilrm6ufe
Sennheiser PXC 300	tnkkphjhcl
Sennheiser PXC 350	sklnikhmie
Sennheiser PXC 450	qlkhempnqj
Sennheiser PXC 550 Wireless	skjjnndmec
Sennheiser PXC 550 Wireless (wired, ANC on)	sjjjpfmigg
Sennheiser PXC 550 Wireless (wired, power on)	niekqhkkkh
Sennheiser PXC 550 Wireless (wireless, ANC on)	qlkkofkjgg
Sennheiser PXC 550-II Wireless	qjifmjnngk
Sennheiser RS 130	uokfkpp7jr
Sennheiser RS 160	plhjnmhkse
Sennheiser RS 165	iocjtektek
Sennheiser RS 170	wgehopiiog
Sennheiser RS 175	8ndpsjhfmj
Sennheiser RS 180	ugfhkqljgk
Sennheiser RS 185	thhglqkhrh
Sennheiser RS 195	aftnmldgqc
Sennheiser RS 220	wjgiklnkkf
Sennheiser SC 160 USB-C	wa7mlommdh
Sennheiser Urbanite	kjggmeoxtt
Sennheiser Urbanite XL	reefknnpqn
SENSO ActivBuds S-250	qib5cvxvxv
SGOR Venus	kkffmmmogg
Shanling ME100	wlieipklqp
Shanling ME200	ojfgnqgmss
Shanling ME500	sjggmqhlso
Shanling ME600 (black nozzle)	ilggnmismn
Shanling ME600 (clear nozzle)	jlggnnhqoo
Shanling ME600 (red nozzle)	hlffmmlsln
Shanling ME700	llggmjkuon
Shanling ME700 Lite	qliknjgooo
Shanling ME800 (off-off)	qkhgnqdnrs
Shanling ME800 (off-on)	qkhhnqelnn
Shanling ME800 (on-off)	pkgfmqerss
Shanling ME800 (on-on)	pkgfmqfopo
Shanling MG100 (red nozzle)	ilghnnio9i
Shanling MG100 (silver nozzle)	rkhinmho8h
Shanling MG600	pjhiorcivq
Shanling MTW200	rjkmmmgcms
Shanling Sono	8mfeoqohmh
Shanling Sono (black nozzle)	ojefmooigg
Shanling TINO (analog cable)	imiinllgpi
Shanling TINO (USB cable)	imhhnlmgpi
Shokz OpenFit	umjmkgklgp
Shokz OpenFit Air	ulrokej9ht
Shokz OpenFit Air (ANC off)	ulqknfibnm
Shokz OpenRun	vlsr9kii89
Shokz OpenRun Pro	xlukckgmso
Shokz OpenRun Pro 2 Bone Conduction	AlwmeabBwu
Shortbus Audio Fat Earth	phdbippwnf
Shortbus Audio Glamdring	jiffljnugh
Shozy & Neo BG	sjhhokgvam
Shozy & Neo CP	sjgejllwmr
Shozy B2	qhddkpmqrp
Shozy BG	rjgelnhvko
Shozy BG Blue Limited Edition	rjgflmhxmm
Shozy Black Hole	unligjrflu
Shozy Black Hole Mini	rfcbipwjhr
Shozy Ceres	pgcbjrkyqj
Shozy Cygnus	xofgidrtov
Shozy Elsa	mjecjrmrqf
Shozy Form 1.1	ohdeklprlp
Shozy Magma	njgimmjngo
Shozy P20	jkggmlhupb
Shozy Rouge	qkgerjknlk
Shozy Stardust (bK)	zhdhheutsu
Shozy T1	sgccjnvldo
Shozy V33	xhddjhtros
Shozy x AAW Hibiki	sigfjqmfwr
Shozy x AAW Hibiki SE	hlgfmsgkxr
Shozy x AAW Pola	pkfejeswwi
Shozy x AAW POLA39	nfcgmhtqji
Shuoer Aoshida E20 (narrow bore eartips)	hmoikljijf
Shuoer Aoshida E20 (wide bore eartips)	hloikljiki
Shuoer Cadenza	jmkikkjple
Shuoer Cadenza 12	hokjmhirlk
Shuoer Cadenza 12 2024	ojjiljjprd
Shuoer Cadenza 12 2025 Edition	jlhimkkmqk
Shuoer Cadenza 4	knkjlkiolf
Shuoer Conductor	nljimjinob
Shuoer D13 (gold nozzle)	kliinncrnq
Shuoer D13 (silver nozzle)	klhinmesnp
Shuoer Dx1	omkilhitmp
Shuoer DZ4	koljlkhkqk
Shuoer EJ07	lroikkfnxp
Shuoer EJ07M	holillgovn
Shuoer EJ07M (CIEM)	eolkljhmrg
Shuoer EJ07M Kinda Lava Edition	knjhlmhnti
Shuoer EJ09	okhglmkoij
Shuoer Galileo	gnmioilghr
Shuoer H27	gollrkdgdn
Shuoer Mystic 8	lplikjkmlg
Shuoer Mystic 8 (black eartips)	jplhkjlole
Shuoer Mystic 8 (clear eartips)	jplhkjloke
Shuoer Mystic 8 (wide eartips)	jplhkjlpmh
Shuoer S08	mjghnkgwki
Shuoer S12	llhinnepkh
Shuoer S12 2024	fmhhnjitjh
Shuoer S12 2024 Special Edition	gnihnjjqjg
Shuoer S12 Pro	kkghnlhtfd
Shuoer S15	kkggnkhwkg
Shuoer Singer	blfgosmbwg
Shuoer Soloist	gmghnpkeqh
Shuoer Tape	kkghnqjexg
Shuoer Tape Pro	righordiAq
Shure Aonic 3	ujhgkklqmq
Shure Aonic 4	nkghmlirtq
Shure Aonic 5 (bright filter)	vkigjmhsts
Shure Aonic 5 (default filter)	ukhfimksss
Shure Aonic 5 (warm filter)	skgehmlupt
Shure AONIC 50	tjajsmighk
Shure AONIC 50 Gen 2	rjekthgm8f
Shure KSE1200	okghnkcBkg
Shure KSE1500	mkghnkcBic
Shure SE110	ymjikiguws
Shure SE112	mkeelommvt
Shure SE210	vokijikpot
Shure SE215	lkfempjnpq
Shure SE215 Ltd	mkfdlokpqt
Shure SE310	xljilhfuus
Shure SE315	xkihmdixts
Shure SE420	xlihjljpxs
Shure SE425	vnjhliipps
Shure SE530	tkhfilltso
Shure SE535	ulihjjjusq
Shure SE846	mlijljjpor
Shure SE846 (black)	klhgjkltus
Shure SE846 (blue)	llhhjjluts
Shure SE846 (white)	lliikjkpps
Shure SRH1440	tmniongang
Shure SRH1540	nhcjmojmom
Shure SRH1840	vmijnmfinj
Shure SRH240	wlgrgihqmf
Shure SRH240A	uhdmkhksml
Shure SRH440	sggmjkjohi
Shure SRH440A	jhbklmmpjh
Shure SRH750DJ	wkkjipcnrk
Shure SRH840	uj9nnmjkik
Shure SRH840A	iiejknmlih
Shure SRH940	ukpdkokhkc
Signature Acoustics Elements C12	lga9guuqip
Silver Monkey Arago	kd8bipxrer
Simgot Audio EA1000 (black nozzle)	rihinoglnl
Simgot Audio EA1000 (blue nozzle)	ulijnnfiji
Simgot Audio EA1000 (gold nozzle)	pkijnndnni
Simgot Audio EA1000 (red nozzle)	qigimnhlok
Simgot Audio EA1000 (silver black nozzle)	okijnnhkih
Simgot Audio EA1000 (silver red nozzle)	mkhimmjlkg
Simgot Audio EA1000 (white nozzle)	tihjnodnqm
Simgot Audio EA500	pjfgmnjomj
Simgot Audio EA500 (black nozzle)	uighmofnnk
Simgot Audio EA500 (Moondrop Kato brass nozzle)	pjggmmjnjf
Simgot Audio EA500 (Moondrop Kato steel nozzle)	pkggmmkole
Simgot Audio EA500 (red nozzle)	tighmogopj
Simgot Audio EA500LM	lkhinmjllh
Simgot Audio EA500LM (black nozzle)	okhinogimn
Simgot Audio EA500LM (bronze nozzle)	ilihnnjjmi
Simgot Audio EA500LM (gold nozzle)	jlhinmkijd
Simgot Audio EA500LM (red nozzle)	njhinoijnl
Simgot Audio EK3 (off-off)	vjhgllfykq
Simgot Audio EK3 (off-on)	wjhgklfykq
Simgot Audio EK3 (on-off)	ujgflmfymr
Simgot Audio EK3 (on-on)	ujgfkmgymr
Simgot Audio EM10	ikjknkhkog
Simgot Audio EM2	rjfdjonrlt
Simgot Audio EM5	qiedkpmros
Simgot Audio EM5H	wjgfhllusu
Simgot Audio EM6L	lkhhlnkkoj
Simgot Audio EN1000 (black plug)	qjhinlhmkp
Simgot Audio EN1000 (blue plug)	rkhinlhnlq
Simgot Audio EN1000 (red plug)	qjhinlhnot
Simgot Audio EN700	vlhglpjets
Simgot Audio EN700 Pro	anhgopkfou
Simgot Audio EP5	jlbrfmhskq
Simgot Audio ET 142 (short black nozzle)	fmhiomcwlc
Simgot Audio ET142 (black circle nozzle)	fmihokdxlh
Simgot Audio ET142 (blazed titanium transparent nozzle)	fmiionbumf
Simgot Audio ET142 (red circle nozzle)	fmhhohgylj
Simgot Audio ET142 (yellow ring nozzle)	gmiionaulg
Simgot Audio EW100	hkgknjljpi
Simgot Audio EW100P	nkiimlkjph
Simgot Audio EW200	mkhimnijpk
Simgot Audio EW300	hmihnmiomk
Simgot Audio EW300 (gold)	gmihlljqsg
Simgot Audio EW300 (silver)	jljjmlgosi
Simgot Audio EW300 DSP	kkiinmhmvi
Simgot Audio FLD100	wmpoob6vrt
Simgot Audio SuperMix 4	fnjjmkimnd
Simphonio RX10	mlihlnfqoi
Simphonio VR1	nmjhkofows
Sineaptic SE-1 (passive, pleather earpads)	irjigewldc
Sineaptic SE-1 (wireless, pleather earpads)	mojjhewlca
Singapore Airlines complimentary earphones	rki0thpAuw
Sivga Anser	ngfjoogksc
Sivga Audio Phoenix	qhieimpmnm
Sivga Audio Robin	fk9ezelsif
Sivga Luan	uffhmpjise
Sivga Nightingale	xnhfhilzn9
Sivga Oriole	jhisiginoc
Sivga P2 Pro	rlijgftnqa
Sivga Que	sgfhnngpjk
Sivga Que UTG	tjggloqbfe
Skullcandy Aviators	wgdgitpbnh
Skullcandy Aviators no Lens	wfdgjlxbqh
Skullcandy Crusher	tfjpfeoowl
Skullcandy Crusher 360	kjdhroliaa
Skullcandy Crusher Evo	ikffpjrm9a
Skullcandy Crusher Wireless	9oahpmpncc
Skullcandy Crusher Wireless (bass boost)	003qwslfja
Skullcandy Crusher Wireless (wired, sub off)	jkaeunpfgd
Skullcandy Dime	fmifolkofd
Skullcandy Dime 2	jlifmlmnfd
Skullcandy Dime 3	gmjhpjmhdn
Skullcandy Grind	ohjgpt9ohl
Skullcandy Grind Fuel	pieeoqgrhg
Skullcandy Grind Wireless	qgihorankm
Skullcandy Hesh	yndjlbnypr
Skullcandy Hesh 2	rhalu8prpq
Skullcandy Hesh 3	8sakrkoi6d
Skullcandy Hesh ANC	4qegrhxcbb
Skullcandy Hesh Evo	eo7jtlsd8b
Skullcandy Hesh NBA	yndjlbnypr
Skullcandy Holua	cmggopihut
Skullcandy Indy	dkedmlrqo4
Skullcandy Indy ANC	8mheolksph
Skullcandy Indy Evo	flifkjmwok
Skullcandy Indy Fuel	flieklmtml
Skullcandy Inkd 2.0	llhiompael
Skullcandy Jib	djdenpmpnn
Skullcandy Jib True	9lhdonkqpj
Skullcandy Mix Master	ugifnjlmwr
Skullcandy Navigator	lkgdmkorws
Skullcandy Push	7lbeopnofn
Skullcandy Push Active	hlhfooiogm
Skullcandy Push Ultra	ulshenikbs
Skullcandy Riff Wireless 2	kdaiwhlq3c
Skullcandy Roc Nation Aviator	whegkqodnh
Skullcandy Sesh	8kffmomsoc
Skullcandy Sesh ANC	cpihmkhu5j
Skullcandy Sesh Evo	alhdkmorpt
Skullcandy SkullCrushers Max Bass	w3dxghiktf
Skullcandy Smokin Buds	hmifplmj9d
Skullcandy Smokin Buds 2	ckeenqmkir
Skullcandy Smokin Buds- Mic'd	wkegiolpjs
Skullcandy Spoke	6ngdpori98
Skullcandy Venue	apidspglaa
Sleek SA1	kkdbilwpmv
Sleek SA6	ukhgijkyso
Smabat M0	zlhd7yiuvk
Smabat M0 + Super Point	yigd3CfBvu
Smabat M2 Pro	ygge5uwlxp
Smabat M2s (gold driver)	xige2wqwws
Smabat M2s Pro	whgd3tvuxo
Smabat M4 (balanced armature driver)	yjffimmrxs
Smabat ST-10S	jjcafqqzxv
Smabat X1 (H switch down)	vnngjmlesj
Smabat X1 (H switch up)	khcclrrjwq
SMS Audio DJ Pro	gmjjflonvs
SMS Audio Over Ear ANC	nemkwj4oqm
SMS Audio Street by 50 Cent	uaccmwjnrk
SMS Audio Sync by 50 Cent	pddchunpup
Snab Overtone EP-101M	ckcckmutjm
SoftEars Cerberus	oplijlgoxp
SoftEars Enigma	ilfgnoimth
SoftEars RS10	mkjklmijrl
SoftEars RSV	mkkijmjlsn
SoftEars Studio 2	ujgfjjkzrq
SoftEars Studio 4	lmkhjlkpqh
SoftEars Studio4 Starry Version	lljhjlmooh
SoftEars Turii	skhgkpimmn
SoftEars Turii Ti	sjgflnmnii
SoftEars Twilight	rkgflpkkqm
SoftEars Volume	plihlmliqn
SoftEars Volume S	sigilliptj
SoftEars Volume S (high impedance)	nlhkolhmie
SoftEars Volume S (low impedance)	lkghlllnpj
SOL REPUBLIC Master Tracks XC	nhfclgwous
SOL REPUBLIC Tracks	ifcdybrorr
SOL REPUBLIC Tracks B	ifbdybtmqq
Somic V2	xmfkmghvnl
Soncie Meory SW500H	llijnkhqpk
Sonic Sonic	AlAk0jEuuw
Sonos Ace	kidhnlmqdq
Sonos Ace (ANC off)	ek8kohsliv
Sonos Ace (ANC on, loudness on)	ehbfnlsnis
Sonos Ace (ANC on)	jidgnjrmgu
Sony DR-Z7	xnokoiajzp
Sony Float Run	ulu8imohja
Sony h.ear on	khdgpjooir
Sony IER-M7	nkggkllqsi
Sony IER-M7 Q	nkggkmkrui
Sony IER-M9	mkggllnopc
Sony IER-M9 (no filter)	okhhmomfsg
Sony IER-NW510N	cicclpqqou
Sony IER-Z1R	mjfiniomkk
Sony IER-Z1R (AZLA Sedna eartips)	kjfhmiqnfi
Sony IER-Z1R (no filter)	ojgjoineem
Sony IER-Z1R (Symbio eartips)	ljfhmhqnfh
Sony INZONE Buds	oifeqpgofo
Sony INZONE H3	pmefpliv99
Sony INZONE H7	viceoqgsc8
Sony INZONE H9	udbfmvdtec
Sony LinkBuds	wmspegatqo
Sony LinkBuds Fit	mlhmjilokm
Sony LinkBuds S	jjhhrhimqu
Sony LinkBuds S (ANC Off)	nkhikklppo
Sony LinkBuds S (ANC on)	okhiljlnqm
Sony MDR-1000X	mkfhkrjlhp
Sony MDR-1000X (wired, ANC off)	labljmz8lr
Sony MDR-1000X (wired, ANC on)	mjghlqnffo
Sony MDR-1000X (wireless, ANC off)	jjeklopdeq
Sony MDR-1000X (wireless, ANC on)	lmfhlpnfdq
Sony MDR-1A	jjekpiipgg
Sony MDR-1AM2	kfcipjongj
Sony MDR-1R	xdfgsgfwvs
Sony MDR-1RBT	pa6uqn9otp
Sony MDR-3	vmrcmllaqn
Sony MDR-7502	wmpklidovo
Sony MDR-7505	vnkkifrfuq
Sony MDR-7506	pfinkmkefo
Sony MDR-7509HD	wnikhpbtmm
Sony MDR-7510	vjaknrcrlq
Sony MDR-7520	rfaoopcphe
Sony MDR-7550	vkhgjkkthu
Sony MDR-AS40EX	ojeekltjlk
Sony MDR-AS50G	qieflmltfk
Sony MDR-AS800	njggnljnpp
Sony MDR-CD2000	wjjmljflmn
Sony MDR-CD3000	vkijkgrgjh
Sony MDR-CD380	vlljoihflt
Sony MDR-CD900ST	xhhiihsjtq
Sony MDR-CD900ST (Yaxi stPad microfiber earpads)	whdiigwkkt
Sony MDR-CD900ST (Yaxi stPad2 earpads)	rhejkhvfer
Sony MDR-D77 Eggo	xfgmmgipuq
Sony MDR-DS3000	unnnniegnn
Sony MDR-DS6000	ymdlmkerwo
Sony MDR-EX10	ekeempojrm
Sony MDR-EX1000	vligjlitgu
Sony MDR-EX1000 (front tube filters removed)	vnjhiofqgu
Sony MDR-EX15LP	ijgfonljrn
Sony MDR-EX15LP (BGVP W01 eartips)	uiegnlpggo
Sony MDR-EX15LP (Moondrop KXXS)	ujfgnlpggi
Sony MDR-EX15LP (SpinFit CP100 eartips)	ujfgnlpgfi
Sony MDR-EX510 (no filter)	ujggkpkjls
Sony MDR-EX56LP	liegkqhsvi
Sony MDR-EX57LP	uheflopeno
Sony MDR-EX600	vligkhmrgu
Sony MDR-EX800ST	wkhgikksiv
Sony MDR-F1	wokimelntr
Sony MDR-G75	xjbioipiwo
Sony MDR-M1	hdhnjlgvmg
Sony MDR-M1ST	xgdniiitur
Sony MDR-MA900	wigilfsioo
Sony MDR-MV1	nhigklnodj
Sony MDR-Q68LW	vnikomgdws
Sony MDR-R10	uoiimfithk
Sony MDR-SA3000	vnilgjojof
Sony MDR-SA5000	wmfnkkhlqg
Sony MDR-V500	umomljj9lo
Sony MDR-V6	selpjjhhfn
Sony MDR-V6 (Yaxi earpads)	sdikmjgsjk
Sony MDR-V600	yigehjtntr
Sony MDR-V700	vnfqmjfjpp
Sony MDR-XB1000	sdd9puljtk
Sony MDR-XB300	t8ceupcrvq
Sony MDR-XB41EX	clffnpipiu
Sony MDR-XB50	licawfnukr
Sony MDR-XB500	nie6ktnsmt
Sony MDR-XB50AP	kibawfpuhs
Sony MDR-XB55AP	lhbbrettgu
Sony MDR-XB700	jj9cvqergm
Sony MDR-XB75AP	ejbfrdtsft
Sony MDR-XB80BS	lkbjmklskr
Sony MDR-XB950B1	cj7iqfputp
Sony MDR-XB950N1	ak9jpfovsn
Sony MDR-Z1000	wohmjjeump
Sony MDR-Z1R	lkcimmjrrk
Sony MDR-Z7	ljfhknkshk
Sony MDR-Z7M2	jkdkkmmnmr
Sony MDR-ZX1000	wmhnimctnm
Sony MDR-ZX110	umfjrpbiii
Sony MDR-ZX110NC	tcdfqhkxgi
Sony MDR-ZX310	wlfohkklsm
Sony MDR-ZX700	xkfilqbunm
Sony MDR-ZX770BN	jgjdrphhec
Sony MH1	flgfmmnnrf
Sony MH1C	9nhgmnkqwh
Sony MH750	cojinnjhph
Sony MH755	bojhnnjipi
Sony PULSE 3D	yfciojhswm
Sony Pulse Elite	sdhjnjinna
Sony PULSE Explore	fmjjnjlkjs
Sony ULT WEAR	al8jmjowgm
Sony ULT WEAR (passive)	cr6jiixpjw
Sony WF-1000X	lmgkilnmoo
Sony WF-1000XM3	rjfikmknng
Sony WF-1000XM3 (ANC on)	qjehjokook
Sony WF-1000XM4	ljghjlnows
Sony WF-1000XM4 (ANC off)	kjggjlnswq
Sony WF-1000XM4 (ANC on)	ljggjlmrvq
Sony WF-1000XM4 (AZLA Sedna Light Short eartips)	lkggilnrvp
Sony WF-1000XM4 (Bass Boost preset)	lihiinlpwj
Sony WF-1000XM4 (Bright preset)	pkiijlkovj
Sony WF-1000XM4 (EQ off)	mkhhjlnpni
Sony WF-1000XM4 (Excited preset)	lihjjlloth
Sony WF-1000XM4 (Final Audio Type E eartips)	mkggimnrvp
Sony WF-1000XM4 (Mellow preset)	mmgehnntxn
Sony WF-1000XM4 (Relaxed preset)	sricjlluxp
Sony WF-1000XM4 (Sony WF-1000XM3 silicone eartips)	lkggilnqwp
Sony WF-1000XM4 (Speech preset)	wpldhllqwr
Sony WF-1000XM4 (SpinFit eartips)	lkggimmsuo
Sony WF-1000XM4 (Tanchjim APB eartips)	lkggilnsvp
Sony WF-1000XM4 (Treble Boost preset)	okhijnjoui
Sony WF-1000XM4 (Vocal preset)	pkjihmkpwl
Sony WF-1000XM5	ojgimninml
Sony WF-C500	enoklocnoh
Sony WF-C700N	khjjniipkq
Sony WF-SP700N	7iffoojuif
Sony WF-SP800N	bghflkqrll
Sony WF-XB700	8llilmkjrn
Sony WH-1000XM2	klgfotbokp
Sony WH-1000XM3	ekajgorqlk
Sony WH-1000XM3 (ANC off)	dhefsqeqko
Sony WH-1000XM3 (ANC on)	fjbjjqkump
Sony WH-1000XM4	elbimiujll
Sony WH-1000XM4 (ANC Off)	qgfhpogphm
Sony WH-1000XM4 (ANC on)	mkcjmnisgp
Sony WH-1000XM5	eldenntgmr
Sony WH-1000XM6	ekhijqijti
Sony WH-1000XM6 (analog cable)	mfecqbvtts
Sony WH-CH400	tcgpfkrfig
Sony WH-CH500	v5emniisif
Sony WH-CH510	r8fnkjiqqi
Sony WH-CH520	sdilkkippd
Sony WH-CH700N	hnjgpqicfk
Sony WH-CH710N	lhhilqjlnm
Sony WH-CH720N	hmbfnqkqdm
Sony WH-H900N	ljffliromm
Sony WH-H910N	hmfhomkkhl
Sony WH-XB700	8jgftlirj9
Sony WH-XB900N	aheiroeqei
Sony WH-XB910N	4jcfzffAbi
Sony WI-1000X	ilfejprlgg
Sony WI-1000XM2	pigilohoio
Sony WI-C100	kmijkjnjtm
Sony WI-C200	lifhonljki
Sony WI-C300	vhdgonkjom
Sony WI-C310	nifhonlgji
Sony WI-C400	uogennlhho
Sony WI-C600N	lihhhmlvej
Sony WI-SP500	uoiffmprbq
Sony WI-SP600N	6jfemomskh
Sony WI-XB400	9nkgnmlkjp
Sony XBA-300	qjffmsleoc
Sony XBA-40	jkfejmtizi
Sony XBA-A2	cledmmtjqi
Sony XBA-A3	pjefmlnook
Sony XBA-A3 (modded)	qjfgljmqkh
Sony XBA-H3	pkfgniqkih
Sony XBA-N1	hkeenokqnj
Sony XBA-N3	hkggnklqmh
Sony XBA-N3AP	jjfgnlkroi
Sony XBA-Z5	oieflkpnqo
Sony XEA20 Xperia Ear Duo	wltmjbndpr
Soranik Bastille-R	olklmochmv
Soranik Bastille-V	lkgitldlhp
Soranik ION-4 (Vietnamese domestic market edition)	hpkhmrblrq
Soranik SK3	vkhgjkokhw
Soranik SP3	qkifllhugn
Soranik SP3 SE	nkhhmlhpgs
Soratune YI01	kliimlimog
Soul by Ludacris SL100	uhecimqrmv
Soul by Ludacris SL150	xifdirpgtr
Soul by Ludacris SL300	t8liiloilk
Soul Combat	xdhd8toxsk
Soul Jet Pro ANC Off	whh2wos9pn
Soul Jet Pro ANC On	pjmbmB6hxt
Sound Intone CX-05	qgkhfgpvqu
Sound Linear Fitz 10 Flat	tljfjkjuuo
Sound Rhyme DTE900 (off-off)	nmhhrleljl
Sound Rhyme DTE900 (off-on)	nlhirlemjg
Sound Rhyme DTE900 (on-off)	llggqlhnlm
Sound Rhyme DTE900 (on-on)	llhgqlgnli
Sound Rhyme Prado (off-off)	rkgdjmnrrt
Sound Rhyme Prado (off-on)	rkgdimnsph
Sound Rhyme Prado (on-off)	mlfdkmoqrt
Sound Rhyme Prado (on-on)	mlfekmnrqh
Sound Rhyme SR5	nmjkkikrmj
Sound Rhyme SR7 (off-off)	uiggkknpro
Sound Rhyme SR7 (off-on)	uiggkknqpk
Sound Rhyme SR7 (on-off)	nkfeklpqsp
Sound Rhyme SR7 (on-on)	mkfeklorrl
SoundMAGIC E10	oieekiqwgp
SoundMAGIC E11	rifgkinwgq
SoundMAGIC E11C	dkifngnvar
SoundMAGIC E50C	mkhglgmvjm
SoundMAGIC HP100	mfshjkkiqf
SoundMAGIC HP200	prdhsreekc
SoundMAGIC T60BT	amgfnpfvil
SoundPeats Air3	xqdfibwwjo
SoundPeats Air3 Deluxe HS	wb8eimuvef
SoundPeats Air4 (ANC off)	rlooqqd01b
SoundPeats Air4 (ANC on)	wdhkranneo
SoundPeats Air4 Pro	ohrikkhinf
SoundPeats Air4 Pro (ANC Off)	gksgkkimqm
SoundPeats Air4 Pro (ANC on, SoundPEATS Classic)	lhohmkjioi
SoundPeats Air4 Pro (ANC on)	lhoimijlpm
SoundPeats Air5 (ANC off, SoundPEATS Classic)	vm9hwckpkp
SoundPeats Air5 (ANC on, SoundPEATS Classic)	vobhxdiojo
SoundPeats Air5 Pro	ehnhjlitoh
SoundPeats Air5 Pro (ANC off, SoundPEATS Classic)	hhqlkgetnd
SoundPeats Air5 Pro (ANC on, SoundPEATS Classic)	ghnijjhumd
SoundPeats Breezy (ANC off)	rlohoou096
SoundPeats Capsule 3 Pro	ihhollhims
SoundPeats Capsule3 Pro+ (ANC off, SoundPEATS Classic)	jgiqlihjl8
SoundPeats Capsule3 Pro+ (ANC on, SoundPEATS Classic)	ihholkkhk8
SoundPeats Clear	jjojmjhkpj
SoundPeats Engine	ggjjjmhsqi
SoundPeats Engine 4	ghkkjmftpe
SoundPeats Free 2 Classic	pejmllbwni
SoundPeats GoFree 2	unlioz71st
SoundPeats H1	bgjimobxpo
SoundPeats H2	ffokkocpsf
SoundPeats Life	s6hsiqbjmn
SoundPeats Life Classic	kcgiommjpq
SoundPeats Mini	mcjqnl9sfc
SoundPeats Mini Pro	kfmnkmfiir
SoundPeats Mini Pro HS	whioljeoqo
SoundPeats Mini Pro HS (ANC off)	kflnlmghip
SoundPeats Mini Pro HS (ANC on)	kelmjohhir
SoundPeats Opera05	dhklklimdp
SoundPeats Q9A	ekdbnrhwjt
SoundPeats RunFree	xl3rjpeqnh
SoundPeats RunFree Lite	vq1gqsingo
SoundPeats Space (ANC on)	gkfnmlgpkl
SoundPeats TrueFree	7pgfoofwnd
SoundPeats TrueFree 2	hdfirlkmb8
SoundPeats Wings2	umoqsh3ilu
SPC Gear Viro (breathable earpads)	recqpnbnhc
SPC Gear Viro (leather earpads)	tedppm9rlg
SPC Gear Viro (velour earpads)	ufgsmlamke
SPC Gear Viro 101M	kjefnpiomo
Spider Moonlight	vhekpoicAf
Spider PowerForce	ncajkoonuq
Spider realvoice	gmhglilvts
Spiral Ear SE 5-Way Ultimate	uhffnp9Axp
Spirit Torino Centauri	v8fidhzofj
Spirit Torino Pulsar	wm8hjhwlfl
Spirit Torino Radiante	jf7lu5urnt
Spirit Torino Superleggera	xlbhggAkik
Status Audio Between 3ANC	glgjqkihkl
Status Audio Between 3ANC (ANC Off)	cjfimqipnf
Status Audio Between 3ANC (ANC on)	fihnmkhnjg
Status Audio Between Pro	ekghmnmnkf
Status Audio BT One	bmijnmkjjk
Status Audio BT One (wired)	qhgqcipmpo
Status Audio BT One (wireless)	mjdfnjqpss
Status Audio IEM-2X	ljefmpnjde
Status Audio SM-CB1	vdhhognlnl
Status Audio SM-OB1	xffhjhpsun
Stax 4070	qllhqkl9ng
Stax Lambda Nova Basic	vblkogfski
Stax Lambda Nova Signature	sklkngkjjj
Stax SR Lambda Pro Classic (bad seal)	ydcookcqji
Stax SR-001 Mk1	wljgikhtxm
Stax SR-001 Mk1 CES (CES-A1)	slheloilso
Stax SR-001 Mk2	xljilgfvwo
Stax SR-002	xmjjdngtvj
Stax SR-003 SA-1993	wkjifkiymf
Stax SR-003MK2	xmijdnisuf
Stax SR-003MK2 (CES-A1)	vkhgfrioji
Stax SR-007	uelhkcsmmh
Stax SR-007 Mk2.5	xdjhjhonwi
Stax SR-007A v2.9	wdlimcmsqe
Stax SR-007A v2.9 (blu-tac mod)	wikimcmsqe
Stax SR-009	wkkklcphri
Stax SR-009 (sample 1)	vkkkldqfni
Stax SR-009 (serial number SZ9-1278)	vjlkleogoi
Stax SR-009S	wkkkmcpiok
Stax SR-1	wqfhmjkqth
Stax SR-207	tllkngljjk
Stax SR-207 (EP-507 leather earpads)	ukkknfliim
Stax SR-3	wnhhmhmksj
Stax SR-40	vpjfkhlrnp
Stax SR-40 Electret SR4 Adapter	upjgnhlmmm
Stax SR-404	zbgmohfpnj
Stax SR-404 (with perfect seal)	wlkjngfqmj
Stax SR-404 Limited	vlkjnfionn
Stax SR-404 Ltd SSL-0670	vlkkngkjjf
Stax SR-404 S 2742	ulkknfkkii
Stax SR-404LE	xl8ookdqpk
Stax SR-404LE (with perfect seal)	tjlknidpok
Stax SR-4070	tkkgqildqp
Stax SR-5 Gold	wjhiikphri
Stax SR-507	vkkkneipmn
Stax SR-84	wnfhnkeupl
Stax SR-Gamma Pro	unfinhlpei
Stax SR-L300	vjelmhlpbi
Stax SR-L300 Limited	ujjjn8rqil
Stax SR-L300 LTD	xhelobnqhk
Stax SR-L300 LTD (L700 earpads)	whhknbophl
Stax SR-L500	vjhkncnoij
Stax SR-L500 (blu-tac mod)	vlkjo8oqjk
Stax SR-L500 (Vesper earpads)	xjfmoapkqi
Stax SR-L700	whiknbpoik
Stax SR-L700 (blu-tac mod)	vljjo8qokk
Stax SR-Lambda Pro	ydfnojeomg
Stax SR-Lambda Pro Classic	ulkkmjcqjh
Stax SR-Lambda Signature	tcmkohkjjh
Stax SR-Lambda Spirit	vlljndnjmg
Stax SR-Sigma 07381	wlhdmcxmjg
Stax SR-X Mk2	vojikinipl
Stax SR-X Mk3 Pro	ukkjlhr9lj
Stax SR-X1	wkkknfhorg
Stax SR-X1 (weak seal)	x8kkofgsqf
Stax SR-X9000	wjkjnbnnlh
Stealthsonics U2	gjccmpppdv
Stealthsonics U4	kkdbiprsjv
Stealthsonics U9	jnjildmurn
Stealthsonics U9 JDM	klihmldvng
SteelSeries Arctis 1	okdfimslch
SteelSeries Arctis 1 Wireless	vfcglkpogf
SteelSeries Arctis 3 2019 Edition	tnjejomlaf
SteelSeries Arctis 5 2019 Edition	qidfmnomlf
SteelSeries Arctis 7 2019 Edition	ugdgkolr8d
SteelSeries Arctis 7 Wireless 2017	ujdglrhoih
SteelSeries Arctis 7+	sgcdoonnfg
SteelSeries Arctis 7P	rgbenolrdg
SteelSeries Arctis 7X	ufdflnmr6e
SteelSeries Arctis 9	xfbhmkltfg
SteelSeries Arctis 9X	vifiljplfg
SteelSeries Arctis Nova 1	nlferjhwcj
SteelSeries Arctis Nova 3	pkfgongueh
SteelSeries Arctis Nova 5	ll8fwlhtdm
SteelSeries Arctis Nova 7	fk9poikrdk
SteelSeries Arctis Nova Pro	ds9oqhhvci
SteelSeries Arctis Nova Pro Wireless	jpbmqhfwhg
SteelSeries Arctis Nova Pro Wireless (Bluetooth, ANC off)	kl5inonoml
SteelSeries Arctis Nova Pro Wireless (Bluetooth, ANC on)	pkakpimolk
SteelSeries Arctis Nova Pro Wireless (wired)	go9mmjmppk
SteelSeries Arctis Prime	nmjgilpk5j
SteelSeries Arctis Pro	qg9knnirgo
SteelSeries Arctis Pro GameDAC	jpkihlmodk
SteelSeries Flux In-Ear	jkggmokmsi
SteelSeries Flux InEar Pro	slhgkllmvs
SteelSeries GameBuds (ANC off)	uifjhlpndi
SteelSeries GameBuds (ANC on)	uigjflpndh
SteelSeries Siberia 200	ngiflrgqej
SteelSeries Tusq	bjcblqtm8g
StereoPravda SB7	umojknboer
Sterling TE-400	xl9glkuhnp
Steven Slate Audio VSX (passive plugin inactive))	ujanlhkttm
Superlux HD 651	wmrfgklhru
Superlux HD 660	pfogmjgr7g
Superlux HD 660 Pro 150 Ohm	lgkknmephj
Superlux HD 662F	ucjmmflnim
Superlux HD 662F (Brainwavz round XL pleather earpads)	obeomhlnaj
Superlux HD 668B	vgfklljnem
Superlux HD 668B (velour earpads)	uiflpkfkah
Superlux HD 681	uklknhiiei
Superlux HD 681 (velour earpads)	tikkpiigcg
Superlux HD 681 EVO	ighkoneqcc
Superlux Hd 681B (Brainwavz round hybrid earpads)	tcdjotibdj
Superlux HD 681B (pleather earpads)	t9fkknkkgj
Superlux HD 681B (velour earpads)	vegkqlhhcg
SWEEAR SR11	righqjfrnl
Swimbuds Waterproof Headphones	emfcocqAxv
Symphonium Audio Aurora	qjfejlntqs
Symphonium Audio Crimson	fljjklhpma
Symphonium Audio Giant	iiffmmixqk
Symphonium Audio Helios	hnlljjhpng
Symphonium Audio Helios SE	eolkjijqjd
Symphonium Audio Meteor	dlgikkjwrd
Symphonium Audio Meteor (AZLA eartips)	gkfilmjtqb
Symphonium Audio Meteor (Comply eartips)	hkgilmjsrf
Symphonium Audio Meteor (JVC Spiral Dot eartips)	gkgilljtte
Symphonium Audio Meteor (SpinFit CP145 eartips)	hkghlmjtsb
Symphonium Audio Mirage	wjhgjlgytt
Symphonium Audio Titan	1pjgmkonji
Symphonium Audio Triton	knjhkkhtpj
Symphonium Audio X Elise Audio Europa	ikjklkhqlg
Symphonized NRG 3.0	ajbanmrtis
SymphonyEars Hexad	njghnjkqko
SymphonyEars Tetrad MK1	hnhdiipxno
Syun ME1 Gold	xkgeimqjtr
Syun Mix1 Gold	ngccjosnxr
T-Peos Altone 200 2014	ohefnriolf
T-Peos H-100	gplkoo7ppb
T-Peos Popular	cmhhonfqgs
T-Peos Rich 200	lkffmnkofu
T-Peos Spider	dlffnnkqgu
T-Peos Tank	blffooiqeu
T-Peos U200R	ilfdlloqou
T+A Solitaire P	skigjjqksk
T+A Solitaire PSE	ughfjiqsic
T+A Solitaire T (ANC on)	hljkhomgug
T+A Solitaire T (passive)	dmijlojilj
TAGO STUDIO T3-02	mmiglgkyno
Takstar Pro 80	riigpifuli
Takstar Pro 82	omdomjerof
Tanchjim 4U	uojhlkjlje
Tanchjim 4U (atmophere)	oihhmlkmkf
Tanchjim 4U (monitoring)	uojhlkjlje
Tanchjim 4U (natural)	vkgimkkmkf
Tanchjim 4U (pop)	uggimlkmkf
Tanchjim Bunny	tighmmipnh
Tanchjim Bunny (analog)	ojfgmmkpmk
Tanchjim Bunny (USB)	nkijjllmpi
Tanchjim Cora	hmihmohlvm
Tanchjim Darling	okhimohkui
Tanchjim Echo	qmgnlmghln
Tanchjim Echo (Tanchjim Echo filter)	hngmmljjig
Tanchjim Fission (gold nozzle, atmosphere switch)	okggmnllng
Tanchjim Fission (nickel nozzle, atmosphere switch)	rkggmnklni
Tanchjim Fission (silver nozzle, atmosphere switch)	pkggmnllng
Tanchjim Fission (silver nozzle, monitoring switch)	umphkkiike
Tanchjim Fission (silver nozzle, natural switch)	uohglmkkmg
Tanchjim Fission (silver nozzle, pop switch)	wlfglnllmg
Tanchjim Fission (USB cable)	nmjjkllhnh
Tanchjim Fission Gold	qkhhmmjlof
Tanchjim Hana	oliinodmpm
Tanchjim Hana (AZLA Sedna Light eartips)	nkhinngohh
Tanchjim Hana (Final Audio Type E eartips)	okhinmgnml
Tanchjim Hana 2021	klihnogltm
Tanchjim Kara	pjgkmjipmi
Tanchjim Mino	x4g5muqkqu
Tanchjim Ola	vmihlmdrmn
Tanchjim Ola (no filter)	unlhhmdxdo
Tanchjim One	nifgmmmkle
Tanchjim ONE (3.5 mm cable)	mjfgmmmlkc
Tanchjim One (USB)	lkhkjlkmpa
Tanchjim One DSP	mjhkklllpb
Tanchjim Origin	uighmmjmoi
Tanchjim Origin (D nozzle)	qkggmnkmnh
Tanchjim Origin (L nozzle)	qkggmnklng
Tanchjim Origin (S nozzle)	qkggmnklng
Tanchjim Oxygen	qjhimngmpj
Tanchjim Prism	kliinngivk
Tanchjim Prism (bass eartips)	imihmmijrk
Tanchjim Prism (treble eartips)	imihmnjjql
Tanchjim Tanya	liefmqmgtn
Tanchjim Tanya DSP	hhglllkmlg
Tanchjim Zero	unjhkoigpp
TANGZU BaJie	klkiljjqng
TANGZU Fudu	flhgnkkpnj
TANGZU Princess Chang Le	dnjgmmkmpo
TANGZU Shimin Li	mkijonclxm
TANGZU Wan'er 2	pihinlerph
TANGZU Wan'er S.G	pjhinmfnvm
TANGZU x HBB XuanNv	jljjnkjlsj
TANGZU x HBB Zetian Wu Heyday Edition	mliimlhqld
TANGZU x SeeAudio Shimin Li Encounter Edition	mlhinnfnuh
TANGZU Yuan Li Dark Force	imjillkmvh
TANGZU YuXuanJi	nkiimmeski
TANGZU Zetian Wu	gmiinnijpk
Tansio Mirai (TSMR) X 10th Anniversary (off-off-off)	ulqplgdihe
Tansio Mirai (TSMR) X 10th Anniversary (off-off-on)	bnjlpjgmli
Tansio Mirai (TSMR) X 10th Anniversary (off-on-off)	9nikpkhnmi
Tansio Mirai (TSMR) X 10th Anniversary (off-on-on)	8mgipljook
Tansio Mirai (TSMR) X 10th Anniversary (on-off-off)	8mfhpljook
Tansio Mirai (TSMR) X 10th Anniversary (on-off-on)	7mfgpmjppl
Tansio Mirai (TSMR) X 10th Anniversary (on-on-off)	7mfgpmkqpl
Tansio Mirai (TSMR) X 10th Anniversary (on-on-on)	7mefpmkqqm
Tansio Mirai HALO	jkfiokhsne
Tansio Mirai Land (off-off-off)	umoikkhlgq
Tansio Mirai Land (off-off-on)	pliinmhkep
Tansio Mirai Land (off-on-off)	mlhhoohkfp
Tansio Mirai Land (on-off-off)	llggopikfq
Tansio Mirai Land (on-on-on)	klffopilfq
Tansio Mirai RGB	klhhlmjopi
Tansio Mirai Shock (yellow 0, brown 0)	6kbbmosumi
Tansio Mirai Shock (yellow 0, brown 4)	6kbbmnsuur
Tansio Mirai Shock (yellow 4, brown 0)	mnmmmhij98
Tansio Mirai Shock (yellow 4, brown 4)	mnmlmhiiip
Tansio Mirai Spark (off-on-off)	pjffllplep
Tansio Mirai Spark (on-on-off)	ojeelmqmgr
Tansio Mirai Spark (on-on-on)	njeelmqmgq
Tansio Mirai TSMR-12 (off-off-on)	rjffirlnlg
Tansio Mirai TSMR-12 (off-on-off)	pjeehpqpoi
Tansio Mirai TSMR-12 (on-off-off)	oiedgosppk
Tansio Mirai TSMR-12 (on-off-on)	lifdjlvlik
Tansio Mirai TSMR-12 (on-on-off)	lifdjlwlil
Tansio Mirai TSMR-12 (on-on-on)	mjdcgotqrk
Tansio Mirai TSMR-3 Pro (off-off-off)	vlptti2c6o
Tansio Mirai TSMR-3 Pro (off-off-on)	ukhhlpfoit
Tansio Mirai TSMR-3 Pro (off-on-off)	sjgfkpiqlu
Tansio Mirai TSMR-3 Pro (off-on-on)	rjfejqirnu
Tansio Mirai TSMR-3 Pro (on-off-off)	qjfejqjrnu
Tansio Mirai TSMR-3 Pro (on-off-on)	qjfdjqjsou
Tansio Mirai TSMR-3 Pro (on-on-off)	qjfdjqjsou
Tansio Mirai TSMR-3 Pro (on-on-on)	pjfdjqjsou
Tansio Mirai TSMR-4 Pro (on-on-off)	klgelrlilq
Tansio Mirai TSMR-5 (off-off-on)	tmjinqeehn
Tansio Mirai TSMR-5 (off-on-off)	tkhgmrhgkp
Tansio Mirai TSMR-5 (on-off-off)	rjgflsjimq
Tansio Mirai TSMR-5 (on-on-on)	qjfelsjjnr
Taobao 3 driver	vnihkjnjnu
Taobao 6 driver	pjeblpmsnp
TaoTronics SoundLiberty 79	6njinknkhc
TaoTronics SoundLiberty 92	ylejkhhzsn
TaoTronics SoundLiberty 94	qhaglpmptc
TaoTronics SoundLiberty 95	xnfkkhdBoi
TaoTronics SoundSurge 60	ybbgjdyuej
TaoTronics TT-BH041 Bluetooth Headset	xooii5qwss
Tascam TH-02	ujihldmAii
TCL SOCL300	miegnogulm
TDK BA200	qlgfjmkvpj
TDK MT300	ckdcnjxhst
Teac CT-H02	qjkgihotjh
Technics EAH-AZ100	gkggloitjb
Technics EAH-AZ70W	hqkmjfgweo
Technics EAH-AZ80	fjidomkqci
Technics EAH-TZ700	ijfgmkjyhf
Tekfusion Ecoofers	8kcbktropm
Tekfusion Twinwoofers	bjbanlwplp
tekkusai Lucid	ijhiokinql
Teknmotion London Underground	vcekr8oumj
TempoTec IM05	ikefopmfpo
TENHZ 3BA	sjgfmjltfn
TENHZ P4 Pro	ukhfmhlrpk
Teufel CAGE (active)	tieeodstin
Teufel CAGE (passive)	pkeepcstko
Teufel Real Blue NC (ANC on, classic EQ)	8nhgomkple
Teufel Real Blue NC (ANC on)	7ojinlhrmf
Teufel Real Blue NC (passive)	dj9mmjoqhk
Teufel Real Blue Pro (ANC on)	fljimiksmn
Teufel Real Blue Pro (passive)	fkcdojquop
Teufel Real Z	qffelwldnk
Teufel Zola (passive)	lk8irkhxpt
Teufel Zola (USB)	hldiqkfwps
TForce Yuan Li	lnkjnmeksi
TForce Yuan Li Dark Soul	kmklrr7bwc
TFZ 1S	ikfgokhvus
TFZ 2S	fnjionelqo
TFZ 4S	mmjjnmboss
TFZ 5S	ikffqlfswq
TFZ Athena	mjefnoohhf
TFZ Balance 2M	cmgfnpetrs
TFZ Exclusive 1	hkggnpijon
TFZ Exclusive 3	dlgfoqglmt
TFZ Exclusive 5	sifhnqenjq
TFZ Force King	hnijopeiil
TFZ Force1	amgfqremgj
TFZ King Pro	gnjinncqns
TFZ Live 1	eniioofiin
TFZ Live 3	clffoojnpl
TFZ Live X	dleenrkmoi
TFZ MY LOVE 4	ulhfjomjjf
TFZ My Love Edition	9nihpngnol
TFZ MY LOVE III	gkggppflyo
TFZ Mylove 2	eniioofllt
TFZ No.3	ijfgooimmt
TFZ S2 Pro	mjhioodmrp
TFZ Secret Garden	okhiopdkju
TFZ T2 Galaxy	dnhhonillo
TFZ T2 Pro	ulhfklnmdl
TFZ Tequila 1	niddlpnnnu
TFZ Tequila Pro	gkfgoqhkmo
TFZ Ti Galaxy	gmihomfovo
TFZ Warrior	ihgepmkolp
TFZ x Angelears Athena	miefnpnhff
TGXear Serratus	wgelkrghnh
TGXear Sunniva	wlbmjrghnt
TGXear Totem	uohljojclj
Thermaltake Isurus	skhehoqljl
ThieAudio Clairvoyance	imkjjngpsj
ThieAudio Clairvoyance (100 ohm resistor)	7nihkohrxn
ThieAudio Elixir	nljimmeprm
ThieAudio Excalibur	klhhnmhomf
ThieAudio ghost	wlgglgqplh
ThieAudio Hype 10	ligjmkhrnc
ThieAudio Hype 2	hlijjkmnkg
ThieAudio Hype 4	miijkkjppd
ThieAudio Legacy 2	omjilmforr
ThieAudio Legacy 3 (CIEM, off-off)	injhmkgsts
ThieAudio Legacy 3 (CIEM, off-on)	knjhlkhtvs
ThieAudio Legacy 3 (CIEM, on-off)	injhmkgstr
ThieAudio Legacy 3 (CIEM, on-on)	kmjhlkhtvs
ThieAudio Legacy 3 (off-off)	jlihmmfrtn
ThieAudio Legacy 3 (off-on)	llihlmgrup
ThieAudio Legacy 3 (on-off)	jlihmmfrtn
ThieAudio Legacy 3 (on-on)	llihlmgrup
ThieAudio Legacy 4 (off-off)	hnkimmenno
ThieAudio Legacy 4 (off-on)	knkilmfnpq
ThieAudio Legacy 4 (on-off)	hnkimmenno
ThieAudio Legacy 4 (on-on)	knkilmfopq
ThieAudio Legacy 5	nmkjjihupq
ThieAudio Legacy 9	fmggnoetqh
ThieAudio Monarch	bonjlkhnfj
ThieAudio Monarch (100 Ohm resistor)	1qphlleuqk
ThieAudio Monarch (20 Ohm resistor)	8pphkletpj
ThieAudio Monarch MKII	llljklilrj
ThieAudio Monarch MKII (JVC Spring eartips)	gmkiklknph
ThieAudio Monarch MKIII	dkjlojiilr
ThieAudio Oracle	kliilkllqh
ThieAudio Oracle MKII	ikiikknnjb
ThieAudio Oracle MKIII	hlhhkllqid
ThieAudio Origin	fjijjlkslc
ThieAudio Prestige	gjjmmikled
ThieAudio Prestige LTD	iljkjkiqoc
ThieAudio V16 Divinity	lkhklmgqrj
ThieAudio Valhalla	dnlhllgrra
ThieAudio Voyager 14 (off-off)	lkhkshcqpk
ThieAudio Voyager 14 (off-on)	okhhpkdrsm
ThieAudio Voyager 14 (on-off)	gkfgvjdrql
ThieAudio Voyager 14 (on-on)	jkgfrlessm
ThieAudio Voyager 3 (on-off)	ikebjlrxjg
ThieAudio Wraith	yfdincsqnj
Thinksoud RAIN	fjbbipxkru
Thinksound On1	jeeokfqnjf
Thinksound ov21	cletniiekf
Thinksound Rain2	gjcbjpvngp
Thinksound Rain3	fiddlrudfl
Thinksound ts01	ikdbjouokr
Thinksound ts02	ikcbjouogr
Tiandirenhe TD1	9mhfrreiuo
Tiandirenhe TD15	5nfeqrikml
Tiandirenhe TD19	emggoogpoj
Timsok TS-1024	shgdlirshk
Timsok TS-316	gmhhnlllhi
Tin HiFi C0	plihmlimof
Tin HiFi C1	glhhnmlkqm
Tin HiFi C2	mkghnmklle
Tin HiFi C2 2025	gmhhmmlkng
Tin HiFi C3	hlhiokjmoi
Tin HiFi C3 MKII	jlhinlkkmh
Tin HiFi C5	hmiinmeqqo
Tin HiFi DUDU	njiinnglpc
Tin HiFi Dudu (analog)	flhhnoimmc
Tin HiFi Dudu (USB)	flhhnnimmd
Tin HiFi P1	xighkimpxj
Tin HiFi P1 (front vent sealed)	pjhgkinoxj
Tin HiFi P1 Max	rjginigvlf
Tin HiFi P1 Max II	njhinmeqnh
Tin HiFi P1 Plus	skihkhmrtf
Tin HiFi P2	njfflkjws8
Tin HiFi P2 Plus Commemorative Edition	miedklmxr8
Tin HiFi T1	mlhhljjtqt
Tin HiFi T1 Plus	oiefmpimvq
Tin HiFi T2	vkhgijrmmi
Tin HiFi T2 (foam eartips)	vlhgiknpif
Tin HiFi T2 (front vent mod)	bmgelmqnnk
Tin HiFi T2 (galaxy mod)	hkggopfmno
Tin HiFi T2 DLC	jlkipkihmm
Tin HiFi T2 DLC 2022	pjhimlkiqk
Tin HiFi T2 Evo	tlihmmldhk
Tin HiFi T2 MKII	umighlomhc
Tin HiFi T2 Plus	qkggnkjrii
Tin HiFi T2 Plus (AZLA Sedna Light Short eartips)	qkgfmkktfl
Tin HiFi T2 Pro	tojfinloeh
Tin HiFi T2 Pro (Comply eartips with Waxguard)	umhfimkt8h
Tin HiFi T2 Pro (white grill, Comply eartips with Waxguard)	tkgfjmmq7f
Tin HiFi T3	vjgfjnjuim
Tin HiFi T3 Plus	lkhiomhkti
Tin HiFi T4	qkihmmfplp
Tin HiFi T4 Plus	mlhhnmjknj
Tin HiFi T5	ojfgoojjlq
Tin HiFi T5 (Comply eartips with Waxguard)	mjffnnmmdm
Tin HiFi T5S	dojinlinlm
Tin HiFi T7	dmhgnnmjij
Tin HiFi Tin Buds 3	siffmppegh
Tin HiFi TWS2000	rjfflqkngk
Tingker H6	qkffknqjkj
Tingker TK200	9ledmnlyma
Tipsy Dunmer Pro	rifekpqjde
Tipsy Dunmer Pro 4	uighoqgipj
Tipsy Spica 260	qhddnokqiq
Tipsy TTROMSO	liefnnkopi
TKZK Ouranos	llhjnkjkng
Toneking TK12s	giccltktge
Toneking TO200	yofggfrwuu
Torque t096z (bass boost filter)	9lffopgsxt
Torque t096z (mid centric filter)	wlihkjoipk
Torque t096z (neutral filter)	vjgelogswt
Torque t096z (treble boost filter)	qjffmqo9qo
Torque t096z (U-shaped filter)	alfforncuq
Torque t096z (warm tilt filter)	ljefnqilvs
Torque t103z (black filter)	djcclolzxv
Torque t103z (red filter)	Bnh9fokywu
Torque t103z (yellow filter)	ngcckpuixr
Torque t402v (around-ear earpads, black vent)	tee3tsitlm
Torque t402v (around-ear earpads, blue vent)	oee0trouoo
Torque t402v (around-ear earpads, red vent)	xff6oslqsq
Torque t402v (around-ear earpads, yellow vent)	ej80wsquno
Torque t402v (on-ear earpads, black vent)	sedbpsjkAr
Torque t402v (on-ear earpads, blue vent)	qfd9ntmlzt
Torque t402v (on-ear earpads, red vent)	recantllAs
Torque t402v (on-ear earpads, yellow vent)	jhb9ntnmAt
Toshiba HR-810 Low Gain	xpmgmlekAo
TOZO A1	6khkknpgec
TOZO NC2	dihfpllnca
TOZO NC7	4plgkpmn38
TOZO NC9	9lieprhnf2
TOZO T10	4hagqskn5e
TOZO T12	4phhqnn9mb
TOZO T6	alhgpqdpo8
Tralucent Audio 1+X plus	jqlikoflqo
Tralucent Audio 1Plus1.2	pkfemrfqsu
Tralucent Audio 1Plus2.3	ojedkxglvb
Tralucent Audio 1Plus5.2	tkhgjkmrxi
Tralucent Audio Audio 1Plus 2.2	unodinfthf
Tranya T10	9ldispfiyn
TREBLAB X5	amgeoojpfc
TREBLAB Z2	ookhokgpjd
TREBLAB Z7 Pro	gldfvnepim
TRI Draco	qlhgnlhooo
TRI i ONE	fmhhoqghpq
TRI i3	enihiterqi
TRI i3 MK3	nmlkligqqg
TRI i3 Pro	dnhfjplpkf
TRI i4	hliiqpbphm
TRI Kai	jliinlesus
TRI Meteor	hokillhnln
TRI Starlight	okhimmeto5
TRI Starsea (off-off)	jmjhmlfwll
TRI Starsea (off-on)	kmjhllfwnl
TRI Starsea (on-off)	jmjhllfwll
TRI Starsea (on-on)	kmjhllgwnm
TRI Starshine	rjgeknnoo7
Tripowin Cencibel	fmliqoedpk
Tripowin H1	spfginpgnv
Tripowin Kailua	ikghnliooh
Tripowin Olina	mlhinmhklj
Tripowin Olina (Tanchjim Tanya filter)	llhinmillk
Tripowin Olina SE	okiimngmqo
Tripowin Piccolo	mkhhnlhptg
Tripowin Rhombus	dnkiqnfgjp
Tripowin TC-01	ikggoqhipk
Tripowin TP10	tjikskdgnt
Tripowin x 0diBi Vivace	kkhhnlipmk
Tripowin x HBB Mele	ilhhnognss
TRN Azure Dragon (Atmospheric Immersion)	pkghnmeuma
TRN Azure Dragon (Reference nozzle)	okghnngpmc
TRN Azure Dragon (Transparency nozzle)	pjghnngnkb
TRN BA5	vkfelqinhm
TRN BAX	qjghmnilmk
TRN BAX Pro (off-off-off)	nifgmpinok
TRN BAX Pro (off-off-on)	sjghnqfjnl
TRN BAX Pro (off-on-on)	sjghnqfipr
TRN BAX Pro (on-off-off)	ojghoqfkol
TRN BAX Pro (on-on-off)	ojghoqfjqs
TRN BAX Pro (on-on-on)	ojghoqfjqs
TRN Conch (black nozzle)	mkiinnglfc
TRN Conch (blue nozzle)	nkijnofkfc
TRN Conch (red nozzle)	lkhhmlknha
TRN CS4	jlhiopghtg
TRN IM1	8mgfpokm8k
TRN Jaws	jlhipmdqjf
TRN Kirin (Atmospheric Immersion nozzle)	njhhnkdvrg
TRN Kirin (reference nozzle)	njhinneooe
TRN Kirin (transparency nozzle)	njhinoeoof
TRN Medusa	njhjnogjle
TRN MT1	lkhioqfetj
TRN MT3	pihhmllleo
TRN MT4	lkhhmpijmc
TRN MT4 Pro	inkjnkgnoi
TRN ORCA (off-off-off)	lkhhnmklfi
TRN ORCA (off-off-on)	okiimlkkfi
TRN ORCA (off-on-on)	okiimlkjlp
TRN ORCA (on-off-off)	lkhhnmklfj
TRN ORCA (on-off-on)	kkghmmknnr
TRN ORCA (on-on-off)	lkhhnmkkmp
TRN ORCA (on-on-on)	lkhhnmkkmp
TRN SHELL (black nozzle)	ljggnohnqe
TRN SHELL (green nozzle)	jkfgnojnqd
TRN SHELL (red nozzle)	jjffnnkoqd
TRN ST5	ljfgonfwnd
TRN TA2	mhefnrgozl
TRN TA3	pheepkjukg
TRN TA4	pifgmlisle
TRN V10 PRO	ilggolhrke
TRN V20	jiefnpfvmb
TRN V30	hkefnpfvlb
TRN V80	dlgfpijzd5
TRN V90	hkghpogpjd
TRN V90 PRO	llijpleoce
TRN VX PRO+	nkghokgufg
TRN White Tiger (black nozzle)	ljfhonjlmf
TRN White Tiger (green nozzle)	jjfgonkmoi
TRN White Tiger (red nozzle)	kjfgnmjpqd
TRN X7	pkgfnmftrt
Tronsmart Apollo Air	fidhpmmkft
Tronsmart Apollo Bold (ANC off, classic)	cgbcptqehd
Tronsmart Apollo Bold (ANC off, jazz)	mhddlrrikf
Tronsmart Apollo Bold (ANC off, pop)	sifeknolsp
Tronsmart Apollo Bold (ANC off, rock)	cgbdptpegd
Tronsmart Apollo Bold (ANC off)	cgdjpojlge
Tronsmart Apollo Bold (ANC on, classic)	4kbcmuside
Tronsmart Apollo Bold (ANC on, jazz)	ekdchtskff
Tronsmart Apollo Bold (ANC on, pop)	llfegqqnoo
Tronsmart Apollo Bold (ANC on, rock)	4kbdmurhdd
Tronsmart Apollo Bold (ANC on)	4jdjlrkobe
Tronsmart Apollo Bold (classic)	chbdqsr9ef
Tronsmart Apollo Bold (jazz)	mieemqrchi
Tronsmart Apollo Bold (normal)	5jdkmqmi8g
Tronsmart Apollo Bold (pop)	sigglnpfrq
Tronsmart Apollo Bold (rock)	chcersq8eg
Tronsmart Onyx Free	pfhinqbunn
Tronsmart Onyx Neo	idlhlmkni9
Tronsmart Onyx Prime	8leenmluii
Tronsmart Onyx Pure	udfjkgpsgk
TrueFree 01	upjilqdgmt
TrueFree T3	tnqumcahqo
Truthear Gate	kmjimlikrm
Truthear Hexa	knjhlljnme
Truthear Hola	jlihmmjmvp
Truthear Nova	eolkmkjhji
Truthear Nova (black double flange eartips)	gnjklkkjlh
Truthear Nova (foam eartips)	imjklkkjki
Truthear Nova (silicone eartips)	gnjjlkkkkh
Truthear Nova (white double flange eartips)	gnjklkkknh
Truthear Pure	hoifjmooqj
Truthear x Crinacle Zero	pggmnlihji
Truthear x Crinacle Zero Blue 2	cljnjjljjc
Truthear x Crinacle Zero Blue 2 (foam eartips)	flklkkmgje
Truthear x Crinacle Zero Blue 2 (ohm adapter)	6kgkkkomme
Truthear x Crinacle Zero Blue 2 (silicone eartips)	cljlkjnijd
Truthear x Crinacle Zero RED	klljkkklni
Truthear x Crinacle Zero RED (Bass+)	jkjikmjmsm
Turtle Beach Atlas Air	vigkpofhid
Turtle Beach Battle Buds	ckbaiswjrq
Turtle Beach Elite 800	nigjwlcjnj
Turtle Beach Elite Atlas	mlfftijojf
Turtle Beach Elite Atlas Aero	nndrmejqih
Turtle Beach Elite Pro 2 SuperAmp	jkeloikpjb
Turtle Beach Recon 200	gn5krnmleg
Turtle Beach Recon 200 Gen 2	ri8lqnkjei
Turtle Beach Recon 500	uidlpfktgq
Turtle Beach Recon 50X	uliegkrrmm
Turtle Beach Recon 70	uofgnjnlgg
Turtle Beach Stealth 300	igehodwkep
Turtle Beach Stealth 500	um6ohjvi9m
Turtle Beach Stealth 600	mhhjpdongk
Turtle Beach Stealth 600 Gen 2	sodkshimfi
Turtle Beach Stealth 600 Gen 3	jm6lrjqh9n
Turtle Beach Stealth 700	ijfaoktoln
Turtle Beach Stealth 700 Gen 2	ikeltfkn98
Turtle Beach Stealth Pro	pc6prihv4h
TWISTURA Woodnote (gold nozzle)	pkggmplhqi
TWISTURA Woodnote (instrumental nozzle)	rlhhmpgkvj
TWISTURA Woodnote (silver nozzle)	qlggmplgqi
TWISTURA Woodnote (standard nozzle)	okggmohouj
TWISTURA Woodnote (steel nozzle)	nkffmomiqh
TWISTURA Woodnote (vocal nozzle)	plhhnpfkvj
TXN Audio Dest Ti	rifglogsrf
TY Hi-Z HM150	ta9frs7Amt
TY Hi-Z HP32	weejsn5xet
UBSound Fighter	hhccmmoylr
Ucotech RE-2	vnljljglph
UFOEar UFO-111	dlilsfev9l
UiiSii BA-T6	hlffoqjiur
Ultimate Ears FITS	tnkejmkr8j
Ultimate Ears Live	okfbonhxsi
Ultimate Ears Reference Monitor	vligiinsdl
Ultimate Ears Reference Monitors	wkhgikkvqo
Ultimate Ears Reference Remastered	vligjhlspl
Ultimate Ears Reference Remastered (CIEM)	wlihkgmosl
Ultimate Ears Super.fi 5 Extra Bass	9kcaksrqgr
Ultimate Ears TF10	okfejipxnk
Ultimate Ears TripleFi 10	pkfejjnxkl
Ultimate Ears UE11	kjddkoornq
Ultimate Ears UE18+ (2nd Gen)	ujgfikmvum
Ultimate Ears UE18+ (3rd Gen)	vjggekqtsq
Ultimate Ears UE18+ (CIEM)	sjgehknxvm
Ultimate Ears UE18+ Pro	vlihjgmsml
Ultimate Ears UE350	dkeelmmvsk
Ultimate Ears UE4 Pro	rjgejmnqlr
Ultimate Ears UE5	qkfejmkwqq
Ultimate Ears UE500	cmgfmniwqj
Ultimate Ears UE6	fmgflkponh
Ultimate Ears UE600	tlhgihprqo
Ultimate Ears UE7	skgeikosns
Ultimate Ears UE700	slhgjilykg
Ultimate Ears UE900S	skgebrmwrj
Ultrasone Edition 10	vggjocyb9h
Ultrasone Edition 8	vjjgkguhfh
Ultrasone Edition 8 Palladium	vmefpiubhi
Ultrasone HFI-2400	uaehnjtgfj
Ultrasone HFI-450	wmjkgimoji
Ultrasone HFI-580	ueokjojarc
Ultrasone HFI-780	wkpnfijjnf
Ultrasone PRO 2900	rbjhqkp9lh
Ultrasone PRO 550	tehugfnjoe
Ultrasone PRO 650	whhnlgpeqi
Ultrasone PRO 900	jg9pnmqbie
Ultrasone PROline 550	ukmyaeocif
Ultrasone PROline 650	oieqpho9ok
Ultrasone Signature Pro	sfgfjfurqh
Ultrasone Signature Pure	dkfkmkolrg
Ultrasone Tribute 7	zd5erdsxim
Ultrasone Zino	vbfmwk5qej
Umi Voix	hkedrepuwt
Under Armour True Wireless Flash	ekiklmeujd
Unique Melody 2HT Terminator	kliipmeofj
Unique Melody 3D Terminator	qmihmoiipl
Unique Melody 3DD-Ti	mplirfkfns
Unique Melody 3DD-Ti Open	nnljrfkfot
Unique Melody 3X	xkhgjdpwiv
Unique Melody Jet Black	kkijlgltfe
Unique Melody Legacy	pjggmkiuqq
Unique Melody Macbeth Ti	glhhmngumm
Unique Melody Maestro V2	rjgglimugr
Unique Melody Martian	vnjilhgvki
Unique Melody Mason V3	nkhinijqfp
Unique Melody Mason V3 Ported	vkfhmikqfq
Unique Melody Maven	shffloiseg
Unique Melody Maverick II	wkffkmjrlq
Unique Melody Mavis 2	vnjilihrhq
Unique Melody ME1	xnihhasttt
Unique Melody Merlin V2	qkgejlmvnl
Unique Melody MEST	jnkjkhlrgh
Unique Melody MEST (CIEM)	mljjjhjwmk
Unique Melody MEST Mk2	hnjijhlvhi
Unique Melody MEST Mk2 (AZLA eartips)	fokjjgnrce
Unique Melody MEST Mk2 (AZLA SoundFit Xelastec eartips)	fokjjgmsee
Unique Melody MEST Mk2 (Moondrop Spring eartips)	fokjjgmtff
Unique Melody MEST Mk2 (SpinFit CP100 eartips)	fokjkgnrdf
Unique Melody MEST mk3	eokijfmvee
Unique Melody MEXT	gnjhkhnrdl
Unique Melody Mini MEST	jjgflnjueq
Unique Melody Miracle V2	nlhflhmviq
Unique Melody Mirage	mjhgkmjtgp
Unique Melody Stardust	kkijkiksik
Unknown Custom Juno	siedhkqxrn
Unknown Custom Juno (min bass)	vjgfjimwhm
Unknown Custom Quad 2.0	pjfdjlpvip
Unknown Custom UCD-2	njecinpuhs
Unknown Custom UCD-3	pjfdilqvio
Urbanears Plattan	thiij4yusv
Urbanfun YBF-ISS014	glggqnihnk
V-MODA BassFit Wireless	difimksgim
V-MODA Crossfade 2 Wireless	mhchshmmum
V-MODA Crossfade 3 Wireless	pgdevgmnuo
V-MODA Crossfade LP	tedgwjhlzp
V-MODA Crossfade LP2	pha4Blnnyo
V-MODA Crossfade M-100	lkdhxherqj
V-MODA Crossfade M-80	sghdrjljtp
V-MODA Crossfade Wireless (wired)	qfagBihjvh
V-MODA Crossfade Wireless (wireless)	oeahzhlgvh
V-MODA LP2	libdxhnjAo
V-MODA M-200	rnkigfmusq
V-MODA V-80 True Blood	oigeuhmkqo
V-MODA XS	khffskmjqm
V-MODA Zn	rfcdkptjhr
Valco VMK20	ohigihrrgm
Valco VMK20 (ANC off)	sfijrekofi
Valco VMK20 (ANC on)	jkifhistfk
Valco VMK20 (passive)	vfgdomlpjk
Valco VMK20 (wired, ANC on)	gie9hqttjm
Valco VMK20 (wireled, power off)	vfgdomlpjk
Valco VMK20 (wireless, ANC off)	sfijrekofi
Valco VMK20 (wireless, ANC on)	jkifhistfk
Valco VMK25 (ANC off)	kngfoewjls
Valco VMK25 (ANC on)	fplijevieo
Valco VMK25 (passive)	klebohpwlo
Valco VMK25 (wired, ANC off)	hkgboipvlr
Valco VMK25 (wired, ANC on)	fojfjhpven
Valco VMK25 (wired, power off)	jmecphpvms
Valco VMK25 (wireless, ANC off)	kngfoewjls
Valco VMK25 (wireless, ANC on)	fplijevieo
Veedix Diamond String	imiglmlkrg
Velodyne vPulse	7pjhnnlgzk
Vento Conductor T-500 Pro	9mggoqjhnj
Venture Electronics Asura 2.0	Ap7cigwvvu
Venture Electronics Bonus In-Ears (BIE)	clgfnqhnqq
Venture Electronics Duke	skgfjnonhf
Venture Electronics Duke (CIEM)	piecjnpsvt
Venture Electronics Grand Duke	fkdbkoumnm
Venture Electronics Monk Blood Orange	zp7gjmkyut
Venture Electronics Monk IE Biggie	qjeaatrwvu
Venture Electronics Monk IE Smalls	pkfcemuutu
Venture Electronics Monk Plus	uolhlpejlg
Venture Electronics Zen	Bm6dghxwwu
Verum One	vkjjkgpjno
Verum One (leather earpads)	wkijkhpfsm
Verum One (ZMF Ori earpads)	ukiikfqkon
violator73 DIY 16 BA	lkglimiooi
ViSang VS-K1	sigglhkysm
Vision Ears Elysium	plhfllolpe
Vision Ears EVE 20	okfdkmpqko
Vision Ears EXT	hlggnmhsm9
Vision Ears EXT MK II	injiojipo8
Vision Ears VE10	pjfelolpsh
Vision Ears VE2	pkfeknmrss
Vision Ears VE3.2	rjfekmkuqr
Vision Ears VE4.2	kjdcktmpfs
Vision Ears VE5	wkhgjjnmvs
Vision Ears VE6X1	rkgeilpovs
Vision Ears VE6X2	slhfhnokts
Vision Ears VE7	olifkkmsli
Vision Ears VE8	qkfekmltmp
Vision Ears VE8 (CIEM)	qjfeklmtqq
Vivo TWS 4 (ANC on, Default)	mhhimmjoih
Vivo XE800	rmkjljgtgl
VJJB N1	dkdboookqt
VSonic Ares	cmggkmkvkq
VSonic GR01	ujgfiknull
VSonic GR02 Bass Edition	flfflhpulu
VSonic GR07	tjhhjjoqlo
VSonic GR07 Bass Edition	rkigijkwmn
VSonic GR07 Classic	ukhfimktln
VSonic GR07 Mk2	vjhgijlvkn
VSonic VC1000	tlhgiinvmg
VSonic VCO2	qjfdjkmypi
VSonic VS05	tifeiktodj
VSonic VS7	wigfhknwno
VSonic VSD1	oigglklrlo
VSonic VSD1S	uhedjpmtns
VSonic VSD2S	vjfddlutfl
VSonic VSD3	pifejksrhj
VSonic VSD3S	fkddjltthl
W+G T2	sifflpjnbm
Walmart Three DOllar Buds	vkwg9hrlmk
Warbler Prelude	ziffilmsxs
Warbler Prelude (CIEM)	zjhgiljtyt
Warwick Acoustics Aperio	omijmdqmoj
Warwick Acoustics Bravura	weikigolpk
Warwick Acoustics Sonoma Model One	thjlkfpjoi
Westone 4R	ugdchlrwqj
Westone ADV Alpha	gkdbklvnsr
Westone ES60 (CIEM)	uifeknjtpp
Westone MACH 80	tkhgjmkqnt
Westone Pro X50	ojecinmywm
Westone UM Pro 10	tlhfiimwvt
Westone UM Pro 20	lkebilqwtt
Westone UM Pro 30	okfdjkmzqs
Westone UM Pro 50	nkecjmmzvr
Westone UM1	ykihjhlsxs
Westone UM3X	slhfjgnypm
Westone UM3X RC	sjgejhozrn
Westone W10	tlhfihotts
Westone W2	tlhgjkjxsj
Westone W20	rlgeimjxvp
Westone W30	qkfdhkrxoi
Westone W40	wifdjipxnc
Westone W50	njdbilrxvm
Westone W60	nkecjlpwri
Westone W80	nkfdjirwts
Whizzer A-HE03 Kylin	kkdbkromuj
Whizzer A15	pjeckormfi
Whizzer A15 Pro	unniklhhqk
Whizzer BS1	slhinobssr
Whizzer HE01	pjggnqhjxj
Whizzer Kylin HE01B	pkghnphitg
Whizzer Kylin HE10	hlhinnjkld
Wicked Audio Deuce	8mfemrmmcr
Willsound MK2	wjdllkgrip
Wiss Audio On Ear Force 1 HP P244	ljgekmpnzp
Woodees iESW100B	glffpolkfo
Woodees iESW100L 24K Blues	eleemqphnr
Woodees iESW101B	elggpokifo
Woodees iESW101V Vintage	gmhfjnomms
Wyze Buds	oi8gnkqqqr
Wyze Buds Pro	kiglkmlidd
Wyze Noise-Cancelling Headphones	gnbqietm2o
Wyze Wireless Gaming Headset	s0brftnedd
Xbox Stereo Headset	li8cnjuvgh
Xbox Wireless Headset	gd5assnufh
Xenns Mangird Tea	inkjlhkqlh
Xenns Mangird Tea Pro 2024	jjhiknipof
Xenns Mangird Tea2	kmjjljipvk
Xenns Mangird Top	hkhkkklmmf
Xenns Mangird Top Pro	hmlhknhqqb
Xenns Mangrid Tea PRO	gljjkmjmki
Xenns UP	kkhhmmgqsl
XFYRO xS2	qiecklvkfk
Xiaomi Crystal	hjddlprkfl
Xiaomi Hybrid	jifgnphnAj
Xiaomi Mi ANC	xmolgcqhAk
Xiaomi Mi True Wireless Earbuds Basic 2	3mfimnnnh9
Xiaomi Piston 2	djddmorlhm
Xiaomi Piston 3	ohdenqlhvp
Xiaomi Piston 3 Youth Edition	qhefmpodvr
XINHS HS3 (off-off)	jnjhlkfwkk
XINHS HS3 (on-on)	mnjhjkhwom
XINHS x Akros Erasmus (off-off)	jnjimkfvog
XINHS x Akros Erasmus (off-on)	mmihkkgwrk
XINHS x Akros Erasmus (on-off)	kmihlkfwoi
XINHS x Akros Erasmus (on-on)	mmjhlkguri
XK-Audio Avalon mk2	pjhhljrgrj
XK-Audio Avalon mk2 (alternative earpads)	mkhhlhthuk
XPG PRECOG S	rgd9mgyuks
XSL X8	fkeemqmnsj
XTZ EarPhone-12	rheelplpup
Yamaha EPH-100	jkggmpcyth
Yamaha HP-300	Bobg8mtxvv
Yamaha HP-50S	xifigitnvn
Yamaha HP1	uhihhjqkym
Yamaha HP1 (sample 1)	uhihijplxk
Yamaha HP1 (serial number 051712)	vhiihjqkyo
Yamaha HP3	xkggjetmvn
Yamaha HPH-200	xgcinkiujl
Yamaha HPH-MT220	khjkm9topi
Yamaha PRO 300	vmqmlfavhl
Yamaha PRO 400	lk8oqbpovn
Yamaha PRO 500	whgetempvn
Yamaha RH5Ma	vffjjpkldl
Yamaha YH-100	tjjihfrpum
Yamaha YH-3	sihggksmti
Yamaha YH-5000SE	tfhjnaouki
Yamaha YH-5000SE (leather earpads)	vfhknaosjh
Yamaha YH-5000SE (suede earpads)	tfgjkdspjg
Yamaha YH-5M	wliidbznnt
Yamaha YH-E700A (ANC on)	fginfmlkpj
Yanyin Aladdin	mmjjlijrrn
Yanyin Cannon II	nheinkjsoh
Yanyin Canon	hlkiojiodl
Yanyin Canon (off-off-off)	ilghnngpqj
Yanyin Canon (off-off-on)	ilghnngqhh
Yanyin Canon (off-on-off)	nliimlfptk
Yanyin Canon (off-on-on)	okiimikqjj
Yanyin Canon (on-off-off)	glggnohprk
Yanyin Canon (on-on-on)	klhhmmhqlk
Yanyin Canon 2 (off-off)	mkhkkilnlj
Yanyin Canon 2 (off-on)	lkgjljlolj
Yanyin Canon 2 (on-off)	lkgjljmmll
Yanyin Canon 2 (on-on)	klgiljmplj
Yanyin Canon II (off-off)	jkfjlklqkf
Yanyin Canon II (off-on)	ikfimklqkf
Yanyin Canon II (on-off)	jkeimklqkf
Yanyin Canon II (on-on)	ikehmklrkf
Yanyin Canon Pro (off-off)	moojjihqoe
Yanyin Canon Pro (off-on)	jnlikjhroe
Yanyin Canon Pro (on-off)	jnljkjhrpf
Yanyin Canon Pro (on-on)	hnkikjirpe
Yanyin Carmen	jjiklhitrk
Yanyin Mahina	imihmkhssl
Yanyin Moonlight	lmjiljgssj
Yanyin Moonlight (2023 version)	jlhgmjjupg
Yincrow RW-9	wkimkignjq
Yincrow X6	zfdijepvst
Yinfu MD51	sjgflrhqcm
Yinyoo Ash	dkfeopgslk
Yinyoo ST7	coolkigmun
Yinyoo Topaz (no filter)	vliinpckoo
Yinyoo V2	gjefnrljal
Ylife True Wireless Earbuds	9ohgppcthd
YU9 Audio U-556	uljjmjfqqn
Yuin G1A	vnghmllihq
Yuin G2A	unhhmlkhjn
Yuin PK1	vlhmkhknhn
Yuin PK2	slpqmjah99
Yutai BAS02	okgfjmmtto
ZEMPIREAUDIO ZE51B	gjhbmnmrpm
Zero Audio Carbo Basso ZH-DX210-CB	6nhfnrjjmq
Zero Audio Carbo Doppio ZH-BX700	vligkmgpmu
Zero Audio Carbo Singolo ZH-BS150-CS	tlhfipiott
Zero Audio Carbo Tenore	iliinpcsih
Zero Audio Duoza ZH-DWX10	kkddkuipsf
ZiiGaat Arcanis	okljlhgvrc
ZiiGaat Cincotres	lkdjojmmpe
ZiiGaat Cinno	fniglhqork
ZiiGaat Doscinco	ekfjnmipnj
ZiiGaat Estrella	clhimllmjd
ZiiGaat Luna	klhhlkjskd
ZiiGaat Lush	oijiijlqrk
ZiiGaat Nuo	hmiimljmnh
ZiiGaat Odyssey	migjkllqme
ZiiGaat x Fresh Reviews Arete	glikmjiprh
ZiiGaat x HBB Arcadia	ijgijlltrg
ZiiGaat x HBB Jupiter	hjgkkkkqqi
ZiiGaat x Jays Audio Estrella	hkhinliomd
Zipbuds Pro Mic	iieelqrfgl
ZMF Aeolus	pjhgiirokq
ZMF Aeolus (universal perforated earpads)	tjijkdroek
ZMF Aeolus (universal perforated suede earpads)	vkijlcskjo
ZMF Aeolus (ZMF BE2 perforated suede earpads)	rghfhlsnln
ZMF Aeolus (ZMF Universe perforated leather earpads)	ufhgikpnnq
ZMF Aeolus (ZMF Universe perforated suede earpads)	vgihijpmmp
ZMF Atrium (perforated lambskin BE2 earpads)	vgggmlnjkp
ZMF Atrium (solid mesh, perforated lambskin earpads)	wighjmkoop
ZMF Atrium (solid mesh, perforated suede earpads)	wighilnnpr
ZMF Atrium (ZMF Auteur perforated leather earpads)	vffgiomjqq
ZMF Atrium (ZMF BE2 perforated suede earpads)	uffgjpnhpm
ZMF Atrium (ZMF Universe perforated leather earpads)	vfghkplhrm
ZMF Atrium (ZMF Universe perforated suede earpads)	xihjjmlgro
ZMF Atrium Closed (ZMF Caldera thin lambskin earpads)	ikjcinwdjp
ZMF Atticus	siahmhsqjr
ZMF Atticus (Eikon suede earpads)	ujbglitnkq
ZMF Atticus (ZMF Eikon suede earpads)	ujeglfrqms
ZMF Atticus (ZMF Ori leather earpads)	plafkgvrlu
ZMF Auteur (perforated lambskin Auteur earpads)	vijjmgnjmo
ZMF Auteur (ZMF Auteur perforated hybrid earpads)	uhfejjukpr
ZMF Auteur (ZMF Auteur perforated leather earpads)	vigghitmkq
ZMF Auteur (ZMF Auteur perforated suede earpads)	uiggijtjks
ZMF Auteur (ZMF Eikon perforated leather earpads)	wjhhjjrilo
ZMF Auteur (ZMF Eikon perforated suede earpads)	sigfkjtjiq
ZMF Auteur (ZMF Universe perforated leather earpads)	uiggjisllp
ZMF Auteur (ZMF Universe perforated suede earpads)	wkhijgrjmo
ZMF Auteur Blackwood	thhijioohl
ZMF Auteur Blackwood (universal perforated earpads)	siiilgpmll
ZMF Auteur Classic	vgghmipirm
ZMF Auteur Classic (ZMF Auteur perforated hybrid earpads)	sigfmiudtp
ZMF Auteur Classic (ZMF Auteur perforated lambskin earpads)	qhgfkjtiso
ZMF Auteur Classic (ZMF Auteur perforated leather earpads)	tihgkiugrp
ZMF Auteur Classic (ZMF Auteur perforated suede earpads)	uihgkjtenp
ZMF Auteur Classic (ZMF BE2 perforated suede earpads)	sihfjktfpo
ZMF Auteur Classic (ZMF Caldera hybrid earpads)	li8aqntnss
ZMF Auteur Classic (ZMF Caldera lambskin earpads)	whghohqgmn
ZMF Auteur Classic (ZMF Caldera suede earpads)	kh77snunsr
ZMF Auteur Classic (ZMF Eikon perforated leather earpads)	viihkirepp
ZMF Auteur Classic (ZMF Eikon perforated suede earpads)	rihelkudmr
ZMF Auteur Classic (ZMF Universe perforated lambskin earpads)	ughhkhvdpm
ZMF Auteur Classic (ZMF Universe perforated leather earpads)	uiiglhteqp
ZMF Auteur Classic (ZMF Universe perforated suede earpads)	wkjikftctn
ZMF Auteur Cocobolo	qjihikonli
ZMF Auteur Teak	rijjmhojjf
ZMF Bokeh	gjmdfppmom
ZMF Bokeh (hybrid earpads, burst mesh)	mknahlujps
ZMF Bokeh (hybrid earpads, no mesh)	mknagmuklo
ZMF Bokeh (hybrid earpads, solid mesh)	nknagmtjrr
ZMF Bokeh (protein earpads, burst mesh)	ijiahmvnqs
ZMF Bokeh (protein earpads, no mesh)	ijjbgmupnp
ZMF Bokeh (suede earpads, no mesh)	mknbglujnp
ZMF Bokeh Closed (hybrid earpads, black mesh)	plelqffwmd
ZMF Bokeh Closed (hybrid earpads, burst mesh)	hkkdhlprur
ZMF Bokeh Closed (hybrid earpads, green mesh)	rkdlpegwpe
ZMF Bokeh Closed (hybrid earpads, no mesh)	ijlchlrrpq
ZMF Bokeh Closed (hybrid earpads, red mesh)	qldlqffvmf
ZMF Bokeh Closed (hybrid earpads, solid mesh)	iklbhlqrvr
ZMF Bokeh Closed (lambskin earpads, red mesh)	qlekqdivlg
ZMF Bokeh Closed (protein earpads, burst mesh)	hiiehlsqpt
ZMF Bokeh Closed (protein earpads, red mesh)	qlejpeivme
ZMF Bokeh Closed (suede earpads, burst mesh)	iklejjqppo
ZMF Bokeh Closed (suede earpads, red mesh)	qlejqfgwnf
ZMF Bokeh S2 (suede earpads)	knmbkmqjvq
ZMF Bokeh S2 (thin hybrid earpads)	kmkcjoqfsq
ZMF Bokeh S2 (thin protein earpads)	fmhakosjvr
ZMF Caldera (cowhide earpads)	qjhfeprkjj
ZMF Caldera (lambskin earpads)	rkhfjpmkkj
ZMF Caldera (suede earpads)	qkhgiqnikj
ZMF Caldera (thick earpads)	pjhdjqpikj
ZMF Caldera (thin lambskin earpads)	qljhhmmmmj
ZMF Eikon	olffmgtmgi
ZMF Eikon (Eikon lambskin earpads)	qjdhkfyhqr
ZMF Eikon (Protein earpads)	omggihwipo
ZMF Eikon (ZMF Auteur leather earpads)	sleflhvkit
ZMF Eikon (ZMF Eikon leather earpads)	smdfniuilq
ZMF Eikon (ZMF Eikon suede earpads)	vkhijhtfoq
ZMF Eikon (ZMF Universe leather earpads)	vlfhmeuhnq
ZMF Verite	tihghiqpmr
ZMF Verite (perforated hybid BE2 earpads)	uhgeglsnns
ZMF Verite (perforated Verite lambskin earpads)	vihghgsnkq
ZMF Verite (ZMF Auteur perforated hybrid earpads)	whhfilmqqq
ZMF Verite (ZMF BE2 perforated hybrid earpads)	tihegnornp
ZMF Verite (ZMF BE2 perforated leather earpads)	wjihhkonmn
ZMF Verite (ZMF Universe perforated leather earpads)	yihhglmrrr
ZMF Verite (ZMF Universe perforated suede earpads)	xmjhhjlopq
ZMF Verite Closed	mihiilmskl
ZMF Verite Closed (Auteur lambskin earpads)	qidjiirlns
ZMF Verite Closed (hybrid Universe earpads)	niekgkppjo
ZMF Verite Closed (ZMF Auteur hybrid earpads)	phfkdmoprp
ZMF Verite Closed (ZMF Auteur leather earpads)	mjehjkqpqq
ZMF Verite Closed (ZMF Eikon leather earpads)	klajhnpsmp
ZMF Verite Closed (ZMF Eikon suede earpads)	niiiglonoq
ZMF Verite Closed (ZMF Universe hybrid earpads)	lidkhkprmp
ZMF Verite Closed (ZMF Universe leather earpads)	pidkijppnq
Zoukbox ZDY10 Bass	ijddlpsgkk
Zoukbox ZLX30	dlggoqkcwl
`;
