require ["fileinto", "imap4flags"];

# rule:[Club newsletter]
if header :contains "list-id" "spree-rowing.example"
{
	fileinto "Club";
	stop;
}

# rule:[Invoices]
if anyof (header :contains "subject" "Invoice", header :contains "from" "billing@")
{
	addflag "$label1";
	fileinto "Receipts";
	stop;
}

# rule:[Family]
if address :domain "from" "lindqvist.example"
{
	addflag "\\Flagged";
}
