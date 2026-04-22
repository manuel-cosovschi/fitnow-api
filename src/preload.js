// Force IPv4 DNS resolution for environments without IPv6 (Render, etc.)
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
